import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  MemoryEntitlementStore,
  setEntitlementStoreForTests,
  type EntitlementRecord,
} from "@/lib/entitlement-store";
import { GET } from "./route";

const USER = "11111111-1111-4111-8111-111111111111";

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

describe("GET /api/entitlement", () => {
  afterEach(() => {
    setEntitlementStoreForTests(null);
    vi.unstubAllEnvs();
  });

  it("returns inactive when the stored period has ended, and not_found for any other id", async () => {
    const store = new MemoryEntitlementStore();
    await store.save(record());
    setEntitlementStoreForTests(store);

    const expired = await GET(new NextRequest(`http://localhost/api/entitlement?user_id=${USER}`));
    expect(expired.status).toBe(200);
    await expect(expired.json()).resolves.toMatchObject({
      status: "inactive",
      plan: "sixMonth",
      endsAt: "2020-01-01T00:00:00.000Z",
    });

    const other = await GET(
      new NextRequest("http://localhost/api/entitlement?user_id=33333333-3333-4333-8333-333333333333"),
    );
    await expect(other.json()).resolves.toEqual({ status: "not_found" });
  });

  it("returns active only while renews_at or ends_at is still ahead", async () => {
    const store = new MemoryEntitlementStore();
    const renewsAt = new Date(Date.now() + 86_400_000).toISOString();
    await store.save(record({ endsAt: null, renewsAt, active: true }));
    setEntitlementStoreForTests(store);

    const response = await GET(new NextRequest(`http://localhost/api/entitlement?user_id=${USER}`));
    await expect(response.json()).resolves.toMatchObject({ status: "active", renewsAt });
  });
});
