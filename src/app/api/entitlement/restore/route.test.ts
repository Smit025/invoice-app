import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MemoryEntitlementStore, setEntitlementStoreForTests, type EntitlementRecord } from "@/lib/entitlement-store";
import { hashEmail } from "@/lib/email-hash";
import { resetRateLimitsForTests } from "@/lib/rate-limit";
import { POST } from "./route";

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STORE = "123";

function record(overrides: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return {
    subscriptionId: "sub_1",
    userId: OTHER,
    plan: "monthly",
    variantId: "2238873",
    status: "active",
    active: true,
    endsAt: null,
    renewsAt: "2026-12-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
    ...overrides,
  };
}

function request(body: unknown, installId = USER) {
  return new NextRequest("http://localhost/api/entitlement/restore", {
    method: "POST",
    headers: { "content-type": "application/json", "x-install-id": installId, "x-forwarded-for": "203.0.113.40" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/entitlement/restore", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", STORE);
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    setEntitlementStoreForTests(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetRateLimitsForTests();
  });

  it("rebinds a webhook-stored order only when the email hash matches", async () => {
    const store = new MemoryEntitlementStore();
    await store.save(record());
    await store.applyWebhook({
      eventId: "wh-order",
      action: "grant",
      dateMode: "fill",
      plan: "monthly",
      variantId: "2238873",
      subjectId: "sub_1",
      userId: OTHER,
      endsAt: null,
      renewsAt: "2026-12-01T00:00:00.000Z",
      updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
      nowMs: Date.parse("2026-10-02T00:00:00.000Z"),
      nowIso: "2026-10-02T00:00:00.000Z",
      status: "active",
      reason: "active",
      refund: false,
      currency: "USD",
      amounts: [299],
      reuseStoredPlan: false,
      orderId: "1001",
      emailHash: hashEmail("buyer@example.com"),
      eventTime: "2026-10-02T00:00:00.000Z",
    });
    setEntitlementStoreForTests(store);

    const mismatch = await POST(request({ email: "other@example.com", orderId: "1001" }));
    expect(mismatch.status).toBe(404);
    expect((await store.getByUserId(OTHER))?.subscriptionId).toBe("sub_1");

    const restored = await POST(request({ email: "Buyer@Example.com", orderId: "1001" }));
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({ status: "active", plan: "monthly" });
    expect(await store.getByUserId(USER)).toMatchObject({ subscriptionId: "sub_1" });
    expect(await store.getByUserId(OTHER)).toBeNull();
  });

  it("does not restore a refunded subscription", async () => {
    const store = new MemoryEntitlementStore();
    await store.save(record({ refunded: true, active: false }));
    await store.applyWebhook({
      eventId: "wh-refunded-order",
      action: "revoke",
      dateMode: "set",
      plan: "monthly",
      variantId: "2238873",
      subjectId: "sub_1",
      userId: OTHER,
      endsAt: "2026-10-02T00:00:00.000Z",
      renewsAt: null,
      updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
      nowMs: Date.parse("2026-10-02T00:00:00.000Z"),
      nowIso: "2026-10-02T00:00:00.000Z",
      status: "refunded",
      reason: "refunded",
      refund: true,
      currency: "USD",
      amounts: [],
      reuseStoredPlan: true,
      orderId: "1002",
      emailHash: hashEmail("buyer@example.com"),
      eventTime: "2026-10-02T00:00:00.000Z",
    });
    setEntitlementStoreForTests(store);

    const response = await POST(request({ email: "buyer@example.com", orderId: "1002" }));
    expect(response.status).toBe(404);
    expect((await store.getBySubscriptionId("sub_1"))?.userId).toBe(OTHER);
  });

  it("checks the Lemon order email, store, payment, and variant before rebinding", async () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "test-key");
    const store = new MemoryEntitlementStore();
    await store.save(record({ subscriptionId: "55", refunded: true, active: false }));
    setEntitlementStoreForTests(store);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/orders/")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "1003",
              attributes: {
                store_id: 123,
                user_email: "buyer@example.com",
                status: "paid",
                refunded: false,
                test_mode: false,
                subscription_id: 55,
                first_order_item: { variant_id: 2238873 },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            id: "55",
            attributes: {
              store_id: 123,
              status: "active",
              variant_id: 2238873,
              renews_at: "2026-12-01T00:00:00.000Z",
              ends_at: null,
              test_mode: false,
            },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ email: "buyer@example.com", orderId: "1003" }));
    expect(response.status).toBe(404);
    expect(await store.getByUserId(USER)).toBeNull();

    await store.save(record({ subscriptionId: "55", refunded: false, active: true }));
    const restored = await POST(request({ email: "buyer@example.com", orderId: "1003" }));
    expect(restored.status).toBe(200);
    expect(await store.getByUserId(USER)).toMatchObject({ subscriptionId: "55", plan: "monthly" });
  });
});
