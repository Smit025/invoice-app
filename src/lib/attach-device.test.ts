import { describe, expect, it, vi } from "vitest";
import { main } from "../../scripts/attach-device";
import { attachDevice, parseAttachArgs, type RedisCommand } from "./attach-device";

const EXTRA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const env = {
  VERCEL_ENV: "production",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

describe("attach device", () => {
  it("rejects a bad install id or subscription id before Redis", async () => {
    let calls = 0;
    const command: RedisCommand = async () => {
      calls += 1;
      return null;
    };
    await expect(
      attachDevice({ env, subscriptionId: "sub_1", installId: "not-an-install-id", orderId: "4242", command }),
    ).resolves.toEqual({ ok: false, reason: "invalid_install" });
    await expect(
      attachDevice({ env, subscriptionId: "bad id", installId: EXTRA, orderId: "4242", command }),
    ).resolves.toEqual({ ok: false, reason: "invalid_id" });
    expect(calls).toBe(0);
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
    expect(parseAttachArgs(["--subscription", "sub_1", "--install", EXTRA, "--order", "4242"])).toEqual({
      subscriptionId: "sub_1",
      installId: EXTRA,
      orderId: "4242",
    });
    expect(parseAttachArgs(["--subscription", "sub_1"])).toBeNull();
  });

  it("prints help and exits 0", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["--help"])).toBe(0);
    expect(log.mock.calls.flat().join(" ")).toContain("npx tsx scripts/attach-device.ts");
    log.mockRestore();
  });

  it("exits non-zero when the script is missing an argument or VERCEL_ENV", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await main(["--subscription", "sub_1"])).toBe(1);
    expect(error.mock.calls.flat().join(" ")).toContain("npx tsx scripts/attach-device.ts");
    expect(
      await main(["--subscription", "sub_1", "--install", EXTRA, "--order", "4242"], {
        ...env,
        VERCEL_ENV: "",
      }),
    ).toBe(1);
    error.mockRestore();
  });
});
