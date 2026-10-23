import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cachedActiveDuringOutage,
  ENTITLEMENT_CACHE_KEY,
  ENTITLEMENT_GRACE_MS,
  fetchEntitlement,
  shouldQueryEntitlement,
} from "./entitlement-client";
import { CHECKOUT_STARTED_KEY, clearCheckoutStarted, hasCheckoutStarted, markCheckoutStarted } from "./install-id";

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function storage() {
  const map = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("localStorage", localStorage);
  return map;
}

describe("entitlement client fail-safe", () => {
  afterEach(() => {
    clearCheckoutStarted();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps a recent cached Pro when Redis answers 500, and never invents Pro", async () => {
    const map = storage();
    map.set(CHECKOUT_STARTED_KEY, "1");
    map.set(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({
        snapshot: { status: "active", plan: "monthly", endsAt: null, renewsAt: "2026-12-01T00:00:00.000Z" },
        fetchedAt: Date.now() - 60_000,
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "down" }), { status: 500 })),
    );

    const kept = await fetchEntitlement(USER, { fresh: true });
    expect(kept).toMatchObject({ status: "active", plan: "monthly" });
    expect(cachedActiveDuringOutage()).toMatchObject({ status: "active", plan: "monthly" });

    map.set(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({
        snapshot: { status: "active", plan: "monthly" },
        fetchedAt: Date.now() - ENTITLEMENT_GRACE_MS - 1_000,
      }),
    );
    expect(await fetchEntitlement(USER, { fresh: true })).toBeNull();

    map.delete(ENTITLEMENT_CACHE_KEY);
    expect(await fetchEntitlement(USER, { fresh: true })).toBeNull();
  });

  it("sends the install id in a header and caches a confirmed active response", async () => {
    const map = storage();
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("X-Install-Id")).toBe(USER);
        expect(String(_url)).not.toContain("user_id=");
        return new Response(
          JSON.stringify({ status: "active", plan: "sixMonth", endsAt: null, renewsAt: "2026-12-01T00:00:00.000Z" }),
          { status: 200 },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await fetchEntitlement(USER, { fresh: true });
    expect(snapshot?.status).toBe("active");
    expect(JSON.parse(map.get(ENTITLEMENT_CACHE_KEY) ?? "{}").snapshot.status).toBe("active");
  });

  it("stops polling after a day of not_found and ignores a not_found cache alone", async () => {
    storage();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    markCheckoutStarted();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "not_found" }), { status: 200 })),
    );

    expect(await fetchEntitlement(USER, { fresh: true })).toMatchObject({ status: "not_found" });
    expect(hasCheckoutStarted()).toBe(true);
    clearCheckoutStarted();
    expect(shouldQueryEntitlement({ fresh: true, fast: false })).toBe(false);

    markCheckoutStarted();
    expect(await fetchEntitlement(USER, { fresh: true })).toMatchObject({ status: "not_found" });
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    expect(await fetchEntitlement(USER, { fresh: true })).toMatchObject({ status: "not_found" });
    expect(hasCheckoutStarted()).toBe(false);
    expect(shouldQueryEntitlement({ fresh: true, fast: false })).toBe(false);
  });
});
