import { afterEach, describe, expect, it, vi } from "vitest";
import { entitlementKeyPrefix } from "./entitlement-keys";
import {
  getEntitlementStore,
  MemoryEntitlementStore,
  recordIsActive,
  setEntitlementStoreForTests,
  UpstashEntitlementStore,
  type EntitlementRecord,
} from "./entitlement-store";

const record: EntitlementRecord = {
  subscriptionId: "sub_1",
  userId: "11111111-1111-4111-8111-111111111111",
  plan: "monthly",
  variantId: "2238873",
  status: "active",
  active: true,
  endsAt: null,
  renewsAt: "2026-12-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  updatedAtMs: Date.parse("2026-11-01T00:00:00.000Z"),
};

describe("entitlement store", () => {
  afterEach(() => {
    setEntitlementStoreForTests(null);
    vi.unstubAllEnvs();
  });

  it("returns not_found for a different install id", async () => {
    const store = new MemoryEntitlementStore();
    await store.save(record);
    expect(await store.getByUserId(record.userId)).toMatchObject({ subscriptionId: "sub_1" });
    expect(await store.getByUserId("22222222-2222-4222-8222-222222222222")).toBeNull();
  });

  it("treats a stored period in the past as inactive", () => {
    expect(recordIsActive(record, new Date("2026-11-15T00:00:00.000Z"))).toBe(true);
    expect(recordIsActive({ ...record, renewsAt: "2026-11-01T00:00:00.000Z" }, new Date("2026-11-15T00:00:00.000Z"))).toBe(
      false,
    );
    expect(recordIsActive({ ...record, active: true, endsAt: null, renewsAt: null })).toBe(false);
  });

  it("uses the Upstash REST API for reads, writes, and event keys", async () => {
    const calls: unknown[][] = [];
    const saved = JSON.stringify(record);
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as string[];
      calls.push(args);
      const [command, key] = args;
      if (command === "GET" && key === "inv:local:user:11111111-1111-4111-8111-111111111111") {
        return { ok: true, json: async () => ({ result: "sub_1" }) };
      }
      if (command === "GET" && key === "inv:local:sub:sub_1") {
        return { ok: true, json: async () => ({ result: saved }) };
      }
      if (command === "GET") {
        return { ok: true, json: async () => ({ result: null }) };
      }
      return { ok: true, json: async () => ({ result: "OK" }) };
    });

    const store = new UpstashEntitlementStore(
      "https://example.upstash.io",
      "token",
      fetchImpl as unknown as typeof fetch,
      "inv:local:",
    );
    expect((await store.getByUserId(record.userId))?.plan).toBe("monthly");
    expect(await store.getByUserId("22222222-2222-4222-8222-222222222222")).toBeNull();
    await store.save(record);
    expect(await store.hasEvent("wh_1")).toBe(false);
    await store.markEvent("wh_1");

    expect(calls).toEqual([
      ["GET", "inv:local:user:11111111-1111-4111-8111-111111111111"],
      ["GET", "inv:local:sub:sub_1"],
      ["GET", "inv:local:user:22222222-2222-4222-8222-222222222222"],
      ["SET", "inv:local:sub:sub_1", saved],
      ["SET", "inv:local:user:11111111-1111-4111-8111-111111111111", "sub_1"],
      ["GET", "inv:local:event:wh_1"],
      ["SET", "inv:local:event:wh_1", "1", "EX", String(60 * 60 * 24 * 45)],
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer token" },
    });
  });

  it("claims, compares, and writes a webhook in one EVAL, and drops the claim if that call fails", async () => {
    const calls: string[][] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const args = JSON.parse(String(init?.body)) as string[];
      calls.push(args);
      if (args[0] === "EVAL" && calls.filter((call) => call[0] === "EVAL").length === 1) {
        return { ok: false, status: 500, json: async () => ({ error: "down" }) };
      }
      return {
        ok: true,
        json: async () => ({
          result: JSON.stringify({ result: "applied", action: "grant", variantId: "2238873", reason: "active" }),
        }),
      };
    });
    const store = new UpstashEntitlementStore(
      "https://example.upstash.io",
      "token",
      fetchImpl as unknown as typeof fetch,
      "inv:local:",
    );
    const spec = {
      eventId: "wh_1",
      action: "grant" as const,
      dateMode: "fill" as const,
      plan: "monthly" as const,
      variantId: "2238873",
      subjectId: "sub_1",
      userId: record.userId,
      endsAt: null,
      renewsAt: record.renewsAt,
      updatedAtMs: record.updatedAtMs,
      nowMs: record.updatedAtMs,
      nowIso: record.updatedAt,
      status: "active",
      reason: "active",
      refund: false,
      currency: "USD",
      amounts: [299],
      reuseStoredPlan: false,
      orderId: null,
      eventTime: record.updatedAt,
    };
    await expect(store.applyWebhook(spec)).rejects.toThrow(/failed/);
    expect(calls[0]?.[0]).toBe("EVAL");
    expect(calls[0]?.[1]).toContain("NX");
    expect(calls[0]?.[1]).toContain("updatedAtMs");
    expect(calls[0]?.[1]).toContain('prefix .. "sub:"');
    expect(calls[0]?.[1]).toContain('prefix .. "user:"');
    expect(calls[0]?.[1]).toContain("does not roll back");
    expect(calls[0]?.[1]).not.toContain("spec.nowIso");
    expect(calls[0]?.[1]).not.toContain("or nowMs");
    expect(calls[0]?.[3]).toBe("inv:local:hook");
    expect(calls[0]?.[4]).toBe("inv:local:");
    expect(calls[1]).toEqual(["DEL", "inv:local:event:wh_1"]);

    await expect(store.applyWebhook({ ...spec, eventId: "wh_2" })).resolves.toMatchObject({ result: "applied" });
    expect(calls.filter((call) => call[0] === "EVAL")).toHaveLength(2);
  });

  it("namespaces Redis keys by VERCEL_ENV", () => {
    expect(entitlementKeyPrefix(undefined)).toBe("inv:local:");
    expect(entitlementKeyPrefix("")).toBe("inv:local:");
    expect(entitlementKeyPrefix("preview")).toBe("inv:preview:");
    expect(entitlementKeyPrefix("Production")).toBe("inv:production:");
    expect(entitlementKeyPrefix("pre view!")).toBe("inv:preview:");
  });

  it("refuses to run in production without Redis credentials", () => {
    expect(() => getEntitlementStore({ NODE_ENV: "production" })).toThrow(/not configured/);
    const store = getEntitlementStore({
      NODE_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io/",
      UPSTASH_REDIS_REST_TOKEN: "token",
    });
    expect(store).toBeInstanceOf(UpstashEntitlementStore);
  });
});
