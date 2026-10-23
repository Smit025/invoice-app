import { describe, expect, it } from "vitest";
import { MemoryEntitlementStore } from "./entitlement-store";
import { LEMON_VARIANT_IDS } from "./lemon-config";
import { persistLemonWebhook } from "./lemon-entitlement";

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STORE = "123";
const NOW = new Date("2026-10-23T12:00:00.000Z");

function subscription(input: {
  event?: string;
  id?: string;
  webhookId: string;
  updatedAt: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  status?: string;
  variantId?: string | null;
  userId?: string;
  type?: string;
  subscriptionId?: string;
  userEmail?: string;
  orderId?: string;
}) {
  const attributes: Record<string, unknown> = {
    store_id: Number(STORE),
    status: input.status ?? "active",
    updated_at: input.updatedAt,
    currency: "USD",
    subtotal: input.variantId === LEMON_VARIANT_IDS.sixMonth ? 799 : 299,
  };
  if (input.variantId !== null) attributes.variant_id = Number(input.variantId ?? LEMON_VARIANT_IDS.monthly);
  if (input.renewsAt !== undefined) attributes.renews_at = input.renewsAt;
  else attributes.renews_at = "2026-12-01T00:00:00.000Z";
  if (input.endsAt !== undefined) attributes.ends_at = input.endsAt;
  if (input.subscriptionId) attributes.subscription_id = input.subscriptionId;
  if (input.userEmail) attributes.user_email = input.userEmail;
  if (input.orderId) attributes.order_id = input.orderId;
  return {
    meta: {
      event_name: input.event ?? "subscription_updated",
      webhook_id: input.webhookId,
      custom_data: { user_id: input.userId ?? USER },
    },
    data: {
      type: input.type ?? "subscriptions",
      id: input.id ?? "sub_race",
      attributes,
    },
  };
}

describe("atomic entitlement updates", () => {
  it("keeps the newer subscription when two events are applied together, in either order", async () => {
    const older = subscription({
      webhookId: "wh-old",
      updatedAt: "2026-10-01T00:00:00.000Z",
      renewsAt: "2026-11-01T00:00:00.000Z",
    });
    const newer = subscription({
      webhookId: "wh-new",
      updatedAt: "2026-10-02T00:00:00.000Z",
      renewsAt: "2026-12-01T00:00:00.000Z",
    });

    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      const store = new MemoryEntitlementStore();
      await Promise.all(order.map((payload) => persistLemonWebhook(payload, store, { storeId: STORE, now: NOW })));
      expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
        renewsAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
        active: true,
      });
    }
  });

  it("does not let a later inactive record hide an active subscription", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        id: "sub_live",
        webhookId: "wh-live",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_expired",
        id: "sub_old",
        webhookId: "wh-old-sub",
        updatedAt: "2026-10-20T00:00:00.000Z",
        renewsAt: null,
        endsAt: "2026-10-01T00:00:00.000Z",
        status: "expired",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      {
        meta: {
          event_name: "license_key_created",
          webhook_id: "wh-lic",
          custom_data: { user_id: USER },
        },
        data: {
          type: "license-keys",
          id: "lic_1",
          attributes: {
            store_id: Number(STORE),
            variant_id: Number(LEMON_VARIANT_IDS.monthly),
            status: "disabled",
            expires_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-10-21T00:00:00.000Z",
          },
        },
      },
      store,
      { storeId: STORE, now: NOW },
    );

    expect(await store.getByUserId(USER)).toMatchObject({ subscriptionId: "sub_live", active: true });
  });

  it("keeps a refund in place when a later active update arrives", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        webhookId: "wh-created",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_payment_refunded",
        webhookId: "wh-refund",
        updatedAt: "2026-10-02T00:00:00.000Z",
        status: "refunded",
        renewsAt: null,
        endsAt: "2026-10-02T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_updated",
        webhookId: "wh-active-again",
        updatedAt: "2026-10-03T00:00:00.000Z",
        status: "active",
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );

    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
      active: false,
      refunded: true,
      renewsAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("regrants Pro when a renewal update arrives before payment_success", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        webhookId: "evt-created",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-11-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_payment_refunded",
        webhookId: "evt-refund",
        updatedAt: "2026-10-02T00:00:00.000Z",
        status: "refunded",
        renewsAt: null,
        endsAt: "2026-10-02T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    const updated = await persistLemonWebhook(
      subscription({
        event: "subscription_updated",
        webhookId: "evt-renew",
        updatedAt: "2026-11-01T00:00:00.000Z",
        status: "active",
        renewsAt: "2026-12-01T00:00:00.000Z",
        endsAt: null,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(updated).toMatchObject({ result: "applied" });
    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
      active: false,
      refunded: true,
      renewsAt: "2026-12-01T00:00:00.000Z",
      endsAt: null,
    });

    const paid = await persistLemonWebhook(
      subscription({
        event: "subscription_payment_success",
        type: "subscription-invoices",
        id: "inv_renew",
        subscriptionId: "sub_race",
        webhookId: "evt-paid",
        updatedAt: "2026-11-01T00:00:01.000Z",
        status: "paid",
        variantId: null,
        renewsAt: null,
        endsAt: null,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
      active: true,
      refunded: false,
      renewsAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("resolves payment_success with no variant_id from the stored subscription", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        id: "sub_inv",
        webhookId: "wh-base",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
        variantId: LEMON_VARIANT_IDS.monthly,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    const outcome = await persistLemonWebhook(
      subscription({
        event: "subscription_payment_success",
        type: "subscription-invoices",
        id: "inv_1",
        subscriptionId: "sub_inv",
        webhookId: "wh-invoice",
        updatedAt: "2026-10-15T00:00:00.000Z",
        status: "paid",
        variantId: null,
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );

    expect(outcome).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(await store.getBySubscriptionId("sub_inv")).toMatchObject({
      plan: "monthly",
      variantId: LEMON_VARIANT_IDS.monthly,
      active: true,
      renewsAt: "2027-01-01T00:00:00.000Z",
    });

    const missing = await persistLemonWebhook(
      subscription({
        event: "subscription_payment_success",
        type: "subscription-invoices",
        id: "inv_missing",
        subscriptionId: "sub_missing",
        webhookId: "wh-invoice-missing",
        updatedAt: "2026-10-15T00:00:00.000Z",
        status: "paid",
        variantId: null,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(missing).toMatchObject({ result: "ignored", reason: "unknown_variant" });
    expect(await store.getBySubscriptionId("sub_missing")).toBeNull();
  });

  it("lets a refund win an equal updated_at, in either order", async () => {
    const grant = subscription({
      webhookId: "evt-grant",
      updatedAt: "2026-10-02T00:00:00.000Z",
      renewsAt: "2026-12-01T00:00:00.000Z",
      status: "active",
    });
    const refund = subscription({
      event: "subscription_payment_refunded",
      webhookId: "evt-refund",
      updatedAt: "2026-10-02T00:00:00.000Z",
      status: "refunded",
      renewsAt: null,
      endsAt: "2026-10-02T00:00:00.000Z",
    });

    for (const order of [
      [grant, refund],
      [refund, grant],
    ]) {
      const store = new MemoryEntitlementStore();
      for (const payload of order) {
        await persistLemonWebhook(payload, store, { storeId: STORE, now: NOW });
      }
      expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
        active: false,
        refunded: true,
        updatedAt: "2026-10-02T00:00:00.000Z",
        eventId: "evt-refund",
      });
    }
  });

  it("breaks a remaining tie with the greater webhook id", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        webhookId: "evt-2",
        updatedAt: "2026-10-02T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        webhookId: "evt-1",
        updatedAt: "2026-10-02T00:00:00.000Z",
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
      renewsAt: "2026-12-01T00:00:00.000Z",
      eventId: "evt-2",
    });
  });

  it("keeps the first device when a later event names a different install id", async () => {
    const store = new MemoryEntitlementStore();
    const other = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await persistLemonWebhook(
      subscription({
        webhookId: "evt-owner",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-11-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        webhookId: "evt-other",
        updatedAt: "2026-10-02T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
        userId: other,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
      userId: USER,
      devices: [USER],
      renewsAt: "2026-12-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    });
    expect(await store.getByUserId(other)).toBeNull();
    expect(await store.getByUserId(USER)).toMatchObject({ renewsAt: "2026-12-01T00:00:00.000Z" });
  });

  it("does not stamp updated_at from the request clock when Lemon omits it", async () => {
    const store = new MemoryEntitlementStore();
    const payload = subscription({
      webhookId: "evt-notime",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    delete (payload.data.attributes as { updated_at?: string }).updated_at;
    await persistLemonWebhook(payload, store, { storeId: STORE, now: NOW });
    const record = await store.getBySubscriptionId("sub_race");
    expect(record?.updatedAtMs).toBe(0);
    expect(record?.updatedAt).toBe("");
    expect(record?.updatedAtMs).not.toBe(NOW.getTime());
  });

  it("refunds the subscription mapped from the order id and leaves a later purchase active", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        id: "sub_old",
        webhookId: "evt-old",
        updatedAt: "2026-10-01T00:00:00.000Z",
        orderId: "4242",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        id: "sub_live",
        webhookId: "evt-live",
        updatedAt: "2026-10-02T00:00:00.000Z",
        renewsAt: "2027-06-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );

    const unmapped = await persistLemonWebhook(
      {
        meta: { event_name: "order_refunded", webhook_id: "evt-unknown-order", custom_data: { user_id: USER } },
        data: {
          type: "orders",
          id: "9999",
          attributes: { store_id: Number(STORE), status: "refunded", updated_at: "2026-10-03T00:00:00.000Z" },
        },
      },
      store,
      { storeId: STORE, now: NOW },
    );
    expect(unmapped).toMatchObject({ result: "ignored", reason: "missing_subscription" });
    expect(await store.getBySubscriptionId("sub_live")).toMatchObject({ active: true });

    const refunded = await persistLemonWebhook(
      {
        meta: { event_name: "order_refunded", webhook_id: "evt-order-refund", custom_data: { user_id: USER } },
        data: {
          type: "orders",
          id: "4242",
          attributes: { store_id: Number(STORE), status: "refunded", updated_at: "2026-10-03T00:00:00.000Z" },
        },
      },
      store,
      { storeId: STORE, now: NOW },
    );
    expect(refunded).toMatchObject({ result: "applied", reason: "refunded" });
    expect(await store.getBySubscriptionId("sub_old")).toMatchObject({ active: false, refunded: true });
    expect(await store.getByUserId(USER)).toMatchObject({ subscriptionId: "sub_live", active: true });
  });
});
