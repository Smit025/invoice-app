import { describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/attach-device";
import { attachDevice, parseAttachArgs, type RedisCommand } from "./attach-device";
import type { EntitlementRecord } from "./entitlement-store";

const INSTALL = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXTRA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const THIRD = "cccccccccccccccccccccccccccccccc";
const FOURTH = "dddddddddddddddddddddddddddddddd";

const env = {
  VERCEL_ENV: "production",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

function record(overrides: Partial<EntitlementRecord> = {}): EntitlementRecord {
  return {
    subscriptionId: "sub_1",
    userId: INSTALL,
    devices: [INSTALL],
    plan: "monthly",
    variantId: "2238873",
    status: "active",
    active: true,
    endsAt: null,
    renewsAt: "2026-12-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
    refunded: false,
    ...overrides,
  };
}

function memory(seed: Record<string, string> = {}): { command: RedisCommand; db: Map<string, string> } {
  const db = new Map(Object.entries(seed));
  const command: RedisCommand = async (args) => {
    const [op, key, value] = args;
    if (op === "GET") return db.get(key) ?? null;
    if (op === "SET") {
      db.set(key, value);
      return "OK";
    }
    throw new Error(op);
  };
  return { command, db };
}

function seed(): Record<string, string> {
  return {
    "inv:production:sub:sub_1": JSON.stringify(record()),
    "inv:production:order:4242": JSON.stringify({ subscriptionId: "sub_1" }),
  };
}

describe("attach device", () => {
  it("appends an install id after the stored order matches the subscription", async () => {
    const { command, db } = memory(seed());
    const result = await attachDevice({
      env,
      subscriptionId: "sub_1",
      installId: EXTRA.toUpperCase(),
      orderId: "4242",
      command,
    });
    expect(result).toEqual({ ok: true, devices: [INSTALL, EXTRA] });
    expect(JSON.parse(db.get("inv:production:sub:sub_1") ?? "{}")).toMatchObject({
      userId: INSTALL,
      devices: [INSTALL, EXTRA],
    });
    expect(db.get(`inv:production:user:${EXTRA}`)).toBe("sub_1");
    expect(JSON.parse(db.get(`inv:production:idx:${EXTRA}`) ?? "[]")).toEqual(["sub_1"]);
  });

  it("does not write when the subscription is refunded", async () => {
    const { command, db } = memory({
      ...seed(),
      "inv:production:sub:sub_1": JSON.stringify(record({ refunded: true, active: false })),
    });
    const result = await attachDevice({
      env,
      subscriptionId: "sub_1",
      installId: EXTRA,
      orderId: "4242",
      command,
    });
    expect(result).toEqual({ ok: false, reason: "refunded" });
    expect(db.get(`inv:production:user:${EXTRA}`)).toBeUndefined();
  });

  it("rejects an order that belongs to a different subscription", async () => {
    const { command } = memory({
      ...seed(),
      "inv:production:order:4242": JSON.stringify({ subscriptionId: "sub_other" }),
    });
    await expect(
      attachDevice({ env, subscriptionId: "sub_1", installId: EXTRA, orderId: "4242", command }),
    ).resolves.toEqual({ ok: false, reason: "order_mismatch" });
  });

  it("stops at three devices and ignores a bad install id", async () => {
    const { command } = memory({
      ...seed(),
      "inv:production:sub:sub_1": JSON.stringify(record({ devices: [INSTALL, EXTRA, THIRD], userId: INSTALL })),
    });
    await expect(
      attachDevice({ env, subscriptionId: "sub_1", installId: FOURTH, orderId: "4242", command }),
    ).resolves.toEqual({ ok: false, reason: "device_cap" });
    await expect(
      attachDevice({ env, subscriptionId: "sub_1", installId: "not-an-install-id", orderId: "4242", command }),
    ).resolves.toEqual({ ok: false, reason: "invalid_install" });
  });

  it("refuses to run when VERCEL_ENV is unset", async () => {
    let calls = 0;
    const command: RedisCommand = async () => {
      calls += 1;
      return null;
    };
    const result = await attachDevice({
      env: { ...env, VERCEL_ENV: "" },
      subscriptionId: "sub_1",
      installId: EXTRA,
      orderId: "4242",
      command,
    });
    expect(result).toEqual({ ok: false, reason: "missing_env" });
    expect(calls).toBe(0);
  });

  it("reads the script flags", () => {
    expect(parseAttachArgs(["--subscription", "sub_1", "--install", INSTALL, "--order", "4242"])).toEqual({
      subscriptionId: "sub_1",
      installId: INSTALL,
      orderId: "4242",
    });
    expect(parseAttachArgs(["--subscription", "sub_1"])).toBeNull();
  });

  it("exits non-zero when the script is missing an argument or VERCEL_ENV", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await main(["--subscription", "sub_1"])).toBe(1);
    expect(
      await main(["--subscription", "sub_1", "--install", EXTRA, "--order", "4242"], {
        ...env,
        VERCEL_ENV: "",
      }),
    ).toBe(1);
    error.mockRestore();
  });
});
