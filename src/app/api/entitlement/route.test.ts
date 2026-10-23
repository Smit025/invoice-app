import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  MemoryEntitlementStore,
  setEntitlementStoreForTests,
  type EntitlementRecord,
} from "@/lib/entitlement-store";
import { ENTITLEMENT_ID_LIMIT, resetRateLimitsForTests } from "@/lib/rate-limit";
import { GET } from "./route";

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function record(overrides: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return {
    subscriptionId: "sub_1",
    userId: USER,
    plan: "sixMonth",
    variantId: "2238798",
    status: "active",
    active: true,
    endsAt: "2020-01-01T00:00:00.000Z",
    renewsAt: null,
    updatedAt: "2020-01-01T00:00:00.000Z",
    updatedAtMs: Date.parse("2020-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function withInstall(userId: string, ip = "203.0.113.10") {
  return new NextRequest("http://localhost/api/entitlement", {
    headers: { "x-install-id": userId, "x-forwarded-for": ip },
  });
}

describe("GET /api/entitlement", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
  });

  afterEach(() => {
    setEntitlementStoreForTests(null);
    vi.unstubAllEnvs();
    resetRateLimitsForTests();
  });

  it("returns inactive when the stored period has ended, and not_found for any other id", async () => {
    const store = new MemoryEntitlementStore();
    await store.save(record());
    setEntitlementStoreForTests(store);

    const expired = await GET(withInstall(USER));
    expect(expired.status).toBe(200);
    expect(expired.headers.get("cache-control")).toContain("max-age=900");
    await expect(expired.json()).resolves.toMatchObject({
      status: "inactive",
      plan: "sixMonth",
      endsAt: "2020-01-01T00:00:00.000Z",
    });

    const other = await GET(withInstall("cccccccccccccccccccccccccccccccc", "203.0.113.11"));
    await expect(other.json()).resolves.toEqual({ status: "not_found" });
  });

  it("returns active only while renews_at or ends_at is still ahead", async () => {
    const store = new MemoryEntitlementStore();
    const renewsAt = new Date(Date.now() + 86_400_000).toISOString();
    await store.save(record({ endsAt: null, renewsAt, active: true }));
    setEntitlementStoreForTests(store);

    const response = await GET(withInstall(USER, "203.0.113.12"));
    await expect(response.json()).resolves.toMatchObject({ status: "active", renewsAt });
  });

  it("rejects a query-string id and a legacy UUID before Redis", async () => {
    const store = new MemoryEntitlementStore();
    const getByUserId = vi.spyOn(store, "getByUserId");
    setEntitlementStoreForTests(store);

    const fromQuery = await GET(
      new NextRequest(`http://localhost/api/entitlement?user_id=${USER}`, {
        headers: { "x-forwarded-for": "203.0.113.13" },
      }),
    );
    await expect(fromQuery.json()).resolves.toEqual({ status: "not_found" });

    const legacy = await GET(withInstall("11111111-1111-4111-8111-111111111111", "203.0.113.14"));
    await expect(legacy.json()).resolves.toEqual({ status: "not_found" });
    expect(getByUserId).not.toHaveBeenCalled();
  });

  it("rate limits per install id without calling Redis past the cap", async () => {
    const store = new MemoryEntitlementStore();
    const getByUserId = vi.spyOn(store, "getByUserId");
    setEntitlementStoreForTests(store);

    let last = 200;
    for (let i = 0; i < ENTITLEMENT_ID_LIMIT + 3; i += 1) {
      const response = await GET(withInstall(USER, "203.0.113.15"));
      last = response.status;
    }
    expect(last).toBe(429);
    expect(getByUserId).toHaveBeenCalledTimes(ENTITLEMENT_ID_LIMIT);
  });

  it("fails safe when Redis is down and does not report a new active grant", async () => {
    const store = new MemoryEntitlementStore();
    vi.spyOn(store, "getByUserId").mockRejectedValue(new Error("redis down"));
    setEntitlementStoreForTests(store);

    const response = await GET(withInstall(USER, "203.0.113.16"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { status?: string };
    expect(body.status).not.toBe("active");
  });
});
