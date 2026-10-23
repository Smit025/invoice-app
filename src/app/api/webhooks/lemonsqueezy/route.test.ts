import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getEntitlement } from "@/app/api/entitlement/route";
import { resetRateLimitsForTests } from "@/lib/rate-limit";
import { MemoryEntitlementStore, setEntitlementStoreForTests } from "@/lib/entitlement-store";
import { LEMON_VARIANT_IDS } from "@/lib/lemon-config";
import { POST } from "./route";

const SECRET = "whsec_test";
const STORE_ID = "123";
const USER_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function signed(body: string, secret = SECRET) {
  return new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
    method: "POST",
    body,
    headers: { "X-Signature": sign(body, secret) },
  });
}

function entitlementRequest(userId: string) {
  return new NextRequest("http://localhost/api/entitlement", {
    headers: { "x-install-id": userId },
  });
}

function future(days = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function past(days = 2): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function payload(input: {
  event: string;
  variantId?: string;
  id?: string;
  webhookId?: string;
  userId?: string | null;
  status?: string;
  attributes?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  custom?: Record<string, unknown>;
  type?: string;
}) {
  const variantId = input.variantId ?? LEMON_VARIANT_IDS.monthly;
  const custom: Record<string, unknown> = { ...(input.custom ?? {}) };
  if (input.userId !== null) custom.user_id = input.userId ?? USER_A;
  return JSON.stringify({
    meta: {
      event_name: input.event,
      webhook_id: input.webhookId ?? `${input.event}-${input.id ?? "sub_1"}`,
      custom_data: custom,
      ...(input.meta ?? {}),
    },
    data: {
      type: input.type ?? "subscriptions",
      id: input.id ?? "sub_1",
      attributes: {
        store_id: Number(STORE_ID),
        variant_id: Number(variantId),
        status: input.status ?? "active",
        renews_at: future(),
        ends_at: null,
        updated_at: new Date().toISOString(),
        currency: "USD",
        subtotal: variantId === LEMON_VARIANT_IDS.monthly ? 299 : 799,
        ...(input.attributes ?? {}),
      },
    },
  });
}

describe("POST /api/webhooks/lemonsqueezy", () => {
  let store: MemoryEntitlementStore;

  beforeEach(() => {
    store = new MemoryEntitlementStore();
    setEntitlementStoreForTests(store);
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", STORE_ID);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    resetRateLimitsForTests();
  });

  afterEach(() => {
    setEntitlementStoreForTests(null);
    vi.unstubAllEnvs();
  });

  async function post(body: string) {
    const response = await POST(signed(body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    return response;
  }

  it("returns 503 when the webhook secret is missing", async () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const request = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body: "{}",
    });
    expect((await POST(request)).status).toBe(503);
  });

  it("returns 503 when the store id is missing", async () => {
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "");
    const response = await POST(signed(payload({ event: "subscription_created" })));
    expect(response.status).toBe(503);
    expect(await store.getByUserId(USER_A)).toBeNull();
  });

  it("returns 503 in production when the entitlement store is not configured", async () => {
    setEntitlementStoreForTests(null);
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(signed(payload({ event: "subscription_created" })));
    expect(response.status).toBe(503);
  });

  it("returns 400 for an invalid signature and does not grant Pro for order_created", async () => {
    const body = payload({ event: "order_created", type: "orders" });
    const bad = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body,
      headers: { "X-Signature": sign(body, "nope") },
    });
    expect((await POST(bad)).status).toBe(400);

    await post(body);
    expect(await store.getByUserId(USER_A)).toBeNull();
  });

  it("grants from subscription_created and subscription_payment_success, then serves that user only", async () => {
    await post(payload({ event: "subscription_created", webhookId: "wh-created" }));
    await post(
      payload({
        event: "subscription_payment_success",
        webhookId: "wh-paid",
        type: "subscription-invoices",
        id: "inv_1",
        status: "paid",
        attributes: { subscription_id: "sub_1", updated_at: future(0) },
      }),
    );

    const record = await store.getByUserId(USER_A);
    expect(record).toMatchObject({
      active: true,
      plan: "monthly",
      variantId: LEMON_VARIANT_IDS.monthly,
      userId: USER_A,
      subscriptionId: "sub_1",
    });

    const mine = await getEntitlement(entitlementRequest(USER_A));
    await expect(mine.json()).resolves.toMatchObject({ status: "active", plan: "monthly" });

    const other = await getEntitlement(entitlementRequest(USER_B));
    await expect(other.json()).resolves.toEqual({ status: "not_found" });

    const invalid = await getEntitlement(entitlementRequest("not-a-uuid"));
    await expect(invalid.json()).resolves.toEqual({ status: "not_found" });
  });

  it("keeps a cancelled subscription active until ends_at and inactive after that date", async () => {
    const endsAt = future(10);
    await post(
      payload({
        event: "subscription_cancelled",
        status: "cancelled",
        webhookId: "wh-cancel",
        attributes: { ends_at: endsAt, renews_at: future(40) },
      }),
    );
    const record = await store.getByUserId(USER_A);
    expect(record).toMatchObject({ active: true, endsAt, renewsAt: null });
    const response = await getEntitlement(entitlementRequest(USER_A));
    await expect(response.json()).resolves.toMatchObject({ status: "active", endsAt });

    await post(
      payload({
        event: "subscription_cancelled",
        status: "cancelled",
        webhookId: "wh-cancel-past",
        id: "sub_past",
        attributes: { ends_at: past(), renews_at: future(40) },
      }),
    );
    expect(await store.getBySubscriptionId("sub_past")).toMatchObject({ active: false });
  });

  it("revokes subscription_expired for both variants", async () => {
    for (const variantId of [LEMON_VARIANT_IDS.monthly, LEMON_VARIANT_IDS.sixMonth]) {
      await post(
        payload({
          event: "subscription_expired",
          variantId,
          id: `sub_${variantId}`,
          status: "expired",
          attributes: { ends_at: past() },
        }),
      );
      expect(await store.getBySubscriptionId(`sub_${variantId}`)).toMatchObject({ active: false, variantId });
    }
  });

  it("rejects the wrong store and a variant that is only present in custom data", async () => {
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-store",
        attributes: { store_id: 999 },
      }),
    );
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-spoof",
        id: "sub_spoof",
        custom: { variant_id: LEMON_VARIANT_IDS.sixMonth },
        attributes: { variant_id: undefined, subtotal: 799, currency: "USD" },
      }),
    );
    expect(await store.getByUserId(USER_A)).toBeNull();
  });

  it("rejects a price or currency that does not match the variant", async () => {
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-eur",
        attributes: { currency: "EUR", subtotal: 299 },
      }),
    );
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-amount",
        id: "sub_amount",
        attributes: { currency: "USD", subtotal: 799 },
      }),
    );
    expect(await store.getByUserId(USER_A)).toBeNull();
  });

  it("ignores a duplicate event id and an older event", async () => {
    const renewsAt = future(20);
    const newer = new Date().toISOString();
    const older = past(1);
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-once",
        attributes: { renews_at: renewsAt, updated_at: newer },
      }),
    );
    await post(
      payload({
        event: "subscription_expired",
        webhookId: "wh-once",
        status: "expired",
        attributes: { ends_at: past(), updated_at: newer },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true, renewsAt });

    await post(
      payload({
        event: "subscription_updated",
        webhookId: "wh-stale",
        status: "expired",
        attributes: { ends_at: past(), updated_at: older, renews_at: null },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true, renewsAt });
  });

  it("does not extend access on payment_failed or past_due", async () => {
    const renewsAt = future(15);
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-base",
        attributes: { renews_at: renewsAt, updated_at: past(1) },
      }),
    );
    await post(
      payload({
        event: "subscription_payment_failed",
        webhookId: "wh-failed",
        type: "subscription-invoices",
        id: "inv_failed",
        status: "pending",
        attributes: {
          subscription_id: "sub_1",
          renews_at: future(90),
          updated_at: new Date().toISOString(),
        },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true, renewsAt });

    await post(
      payload({
        event: "subscription_updated",
        webhookId: "wh-past-due",
        status: "past_due",
        attributes: { renews_at: future(120), updated_at: future(0) },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true, renewsAt });

    store = new MemoryEntitlementStore();
    setEntitlementStoreForTests(store);
    await post(
      payload({
        event: "subscription_updated",
        webhookId: "wh-past-due-only",
        id: "sub_new",
        status: "past_due",
        attributes: { renews_at: future(30) },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: false, renewsAt: null, endsAt: null });
  });

  it("pauses, resumes, and unpauses without inventing a longer period", async () => {
    const renewsAt = future(12);
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-live",
        attributes: { renews_at: renewsAt, updated_at: past(1) },
      }),
    );
    await post(
      payload({
        event: "subscription_paused",
        webhookId: "wh-pause",
        status: "paused",
        attributes: { renews_at: future(80), updated_at: new Date().toISOString() },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: false, renewsAt });

    await post(
      payload({
        event: "subscription_resumed",
        webhookId: "wh-resume",
        status: "active",
        attributes: { renews_at: renewsAt, updated_at: future(0) },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true, renewsAt });

    await post(
      payload({
        event: "subscription_paused",
        webhookId: "wh-pause-2",
        id: "sub_2",
        status: "paused",
        attributes: { renews_at: renewsAt, updated_at: past(1) },
      }),
    );
    await post(
      payload({
        event: "subscription_unpaused",
        webhookId: "wh-unpause",
        id: "sub_2",
        status: "active",
        attributes: { renews_at: renewsAt, updated_at: new Date().toISOString() },
      }),
    );
    expect(await store.getBySubscriptionId("sub_2")).toMatchObject({ active: true, renewsAt });
  });

  it("revokes refunds for a subscription payment and an order", async () => {
    const renewsAt = future(20);
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-before-refund",
        attributes: { renews_at: renewsAt, updated_at: past(1) },
      }),
    );
    await post(
      payload({
        event: "subscription_payment_refunded",
        webhookId: "wh-sub-refund",
        type: "subscription-invoices",
        id: "inv_refund",
        status: "refunded",
        attributes: { subscription_id: "sub_1", renews_at: renewsAt, updated_at: new Date().toISOString() },
      }),
    );
    const refunded = await store.getByUserId(USER_A);
    expect(refunded?.active).toBe(false);
    expect(refunded?.endsAt && Date.parse(refunded.endsAt) <= Date.now()).toBe(true);

    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-order-base",
        id: "sub_order",
        variantId: LEMON_VARIANT_IDS.sixMonth,
        attributes: { renews_at: renewsAt, updated_at: past(1) },
      }),
    );
    const orderBody = JSON.stringify({
      meta: {
        event_name: "order_refunded",
        webhook_id: "wh-order-refund",
        custom_data: { user_id: USER_A, variant_id: "999" },
      },
      data: {
        type: "orders",
        id: "ord_1",
        attributes: {
          store_id: Number(STORE_ID),
          subscription_id: "sub_order",
          currency: "USD",
          subtotal: 799,
          total: 850,
          updated_at: new Date().toISOString(),
          first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) },
        },
      },
    });
    await post(orderBody);
    expect(await store.getBySubscriptionId("sub_order")).toMatchObject({ active: false });
  });

  it("accepts test_mode only when VERCEL_ENV is preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-test-mode",
        meta: { test_mode: true },
      }),
    );
    expect(await store.getByUserId(USER_A)).toBeNull();

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-test-mode-node",
        meta: { test_mode: true },
      }),
    );
    expect(await store.getByUserId(USER_A)).toBeNull();

    vi.stubEnv("VERCEL_ENV", "preview");
    await post(
      payload({
        event: "subscription_created",
        webhookId: "wh-test-mode-preview",
        meta: { test_mode: true },
      }),
    );
    expect(await store.getByUserId(USER_A)).toMatchObject({ active: true });
  });

  it("reads the variant from first_order_item and not from custom data", async () => {
    const body = JSON.stringify({
      meta: {
        event_name: "subscription_created",
        webhook_id: "wh-item",
        custom_data: { user_id: USER_A, variant_id: LEMON_VARIANT_IDS.monthly },
      },
      data: {
        type: "subscriptions",
        id: "sub_item",
        attributes: {
          store_id: Number(STORE_ID),
          status: "active",
          currency: "USD",
          subtotal: 799,
          renews_at: future(),
          updated_at: new Date().toISOString(),
          first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) },
        },
      },
    });
    await post(body);
    expect(await store.getByUserId(USER_A)).toMatchObject({
      plan: "sixMonth",
      variantId: LEMON_VARIANT_IDS.sixMonth,
    });
  });
});
