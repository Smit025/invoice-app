import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type RedisClientType } from "redis";
import { attachDevice, type RedisCommand } from "./attach-device";
import { EVENT_TTL_SECONDS, WEBHOOK_LUA } from "./webhook-lua";
import { eventPrecedence, type WebhookSpec } from "./webhook-apply";

const redisUrl = process.env.REDIS_URL;

if (process.env.CI && !redisUrl) {
  throw new Error("REDIS_URL is required in CI so the webhook Lua script runs against Redis");
}

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NOW = Date.parse("2026-10-23T12:00:00.000Z");

function spec(overrides: Partial<WebhookSpec> & Pick<WebhookSpec, "eventId" | "action" | "reason">): WebhookSpec {
  return {
    dateMode: "fill",
    plan: "monthly",
    variantId: "2238873",
    subjectId: "sub_race",
    userId: USER,
    endsAt: null,
    renewsAt: "2026-12-01T00:00:00.000Z",
    updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
    nowMs: NOW,
    nowIso: "2026-10-23T12:00:00.000Z",
    status: "active",
    refund: false,
    currency: "USD",
    amounts: [299],
    reuseStoredPlan: false,
    orderId: null,
    eventTime: "2026-10-02T00:00:00.000Z",
    ...overrides,
  };
}

function wire(input: WebhookSpec) {
  return {
    ...input,
    eventId: input.eventId ?? "",
    plan: input.plan ?? "",
    variantId: input.variantId ?? "",
    subjectId: input.subjectId ?? "",
    userId: input.userId ?? "",
    endsAt: input.endsAt ?? "",
    renewsAt: input.renewsAt ?? "",
    status: input.status ?? "",
    currency: input.currency ?? "",
    orderId: input.orderId ?? "",
    eventTime: input.eventTime ?? "",
    updatedAtMs: input.updatedAtMs,
    precedence: eventPrecedence(input),
  };
}

describe.skipIf(!redisUrl)("webhook lua against redis", () => {
  let client: RedisClientType;

  beforeAll(async () => {
    client = createClient({ url: redisUrl });
    await client.connect();
  });

  beforeEach(async () => {
    await client.flushDb();
  });

  afterAll(async () => {
    if (client?.isOpen) await client.quit();
  });

  async function apply(prefix: string, input: WebhookSpec) {
    const raw = await client.eval(WEBHOOK_LUA, {
      keys: [`${prefix}hook`],
      arguments: [prefix, String(EVENT_TTL_SECONDS), JSON.stringify(wire(input))],
    });
    return JSON.parse(String(raw)) as { result: string; reason: string };
  }

  async function readSub(prefix: string, subscriptionId: string) {
    const raw = await client.get(`${prefix}sub:${subscriptionId}`);
    return raw
      ? (JSON.parse(raw) as {
          renewsAt?: string | null;
          endsAt?: string | null;
          updatedAt?: string;
          updatedAtMs?: number;
          refunded?: boolean;
          refundEndsAt?: string | null;
          active?: boolean;
          userId?: string;
          devices?: string[];
          eventId?: string;
        })
      : null;
  }

  it("keeps the newer subscription when both orders run", async () => {
    const older = spec({
      eventId: "evt-old",
      action: "grant",
      reason: "active",
      updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
      eventTime: "2026-10-01T00:00:00.000Z",
      renewsAt: "2026-11-01T00:00:00.000Z",
    });
    const newer = spec({
      eventId: "evt-new",
      action: "grant",
      reason: "active",
      updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
      eventTime: "2026-10-02T00:00:00.000Z",
      renewsAt: "2026-12-01T00:00:00.000Z",
    });
    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      await client.flushDb();
      await Promise.all(order.map((item) => apply("inv:local:", item)));
      expect(await readSub("inv:local:", "sub_race")).toMatchObject({
        renewsAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
        active: true,
      });
    }
  });

  it("lets refunded win an equal updated_at in either order", async () => {
    const grant = spec({ eventId: "evt-grant", action: "grant", reason: "active" });
    const refund = spec({
      eventId: "evt-refund",
      action: "revoke",
      reason: "refunded",
      refund: true,
      status: "refunded",
      dateMode: "set",
      reuseStoredPlan: true,
      renewsAt: null,
      endsAt: "2026-10-02T00:00:00.000Z",
    });
    for (const order of [
      [grant, refund],
      [refund, grant],
    ]) {
      await client.flushDb();
      for (const item of order) await apply("inv:local:", item);
      expect(await readSub("inv:local:", "sub_race")).toMatchObject({
        refunded: true,
        active: false,
        eventId: "evt-refund",
      });
    }
  });

  it("breaks a precedence tie with the greater event id", async () => {
    await apply(
      "inv:local:",
      spec({ eventId: "evt-2", action: "grant", reason: "active", renewsAt: "2026-12-01T00:00:00.000Z" }),
    );
    await apply(
      "inv:local:",
      spec({ eventId: "evt-1", action: "grant", reason: "active", renewsAt: "2027-01-01T00:00:00.000Z" }),
    );
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      renewsAt: "2026-12-01T00:00:00.000Z",
      eventId: "evt-2",
    });
  });

  it("adds only the first device and still applies a later event", async () => {
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-owner",
        action: "grant",
        reason: "active",
        updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
        eventTime: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-other",
        action: "grant",
        reason: "active",
        userId: OTHER,
        updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
        eventTime: "2026-10-02T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
    );
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      userId: USER,
      devices: [USER],
      renewsAt: "2026-12-01T00:00:00.000Z",
    });
    expect(await client.get(`inv:local:user:${OTHER}`)).toBeNull();
    expect(await client.get(`inv:local:user:${USER}`)).toBe("sub_race");
  });

  it("refunds the mapped order and leaves another subscription active", async () => {
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-old",
        action: "grant",
        reason: "active",
        subjectId: "sub_old",
        orderId: "4242",
        updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
        eventTime: "2026-10-01T00:00:00.000Z",
      }),
    );
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-live",
        action: "grant",
        reason: "active",
        subjectId: "sub_live",
        renewsAt: "2027-06-01T00:00:00.000Z",
        updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
        eventTime: "2026-10-02T00:00:00.000Z",
      }),
    );
    const missing = await apply(
      "inv:local:",
      spec({
        eventId: "evt-missing-order",
        action: "revoke",
        reason: "refunded",
        refund: true,
        subjectId: null,
        plan: null,
        variantId: null,
        orderId: "9999",
        reuseStoredPlan: true,
        amounts: [],
        updatedAtMs: Date.parse("2026-10-03T00:00:00.000Z"),
        eventTime: "2026-10-03T00:00:00.000Z",
      }),
    );
    expect(missing).toMatchObject({ result: "ignored", reason: "missing_subscription" });
    expect(await readSub("inv:local:", "sub_live")).toMatchObject({ active: true });

    const refunded = await apply(
      "inv:local:",
      spec({
        eventId: "evt-order-refund",
        action: "revoke",
        reason: "refunded",
        refund: true,
        status: "refunded",
        dateMode: "set",
        subjectId: null,
        plan: null,
        variantId: null,
        orderId: "4242",
        reuseStoredPlan: true,
        amounts: [],
        endsAt: "2026-10-03T00:00:00.000Z",
        renewsAt: null,
        updatedAtMs: Date.parse("2026-10-03T00:00:00.000Z"),
        eventTime: "2026-10-03T00:00:00.000Z",
      }),
    );
    expect(refunded).toMatchObject({ result: "applied", reason: "refunded" });
    expect(await readSub("inv:local:", "sub_old")).toMatchObject({ refunded: true, active: false });
    expect(await readSub("inv:local:", "sub_live")).toMatchObject({ active: true, refunded: false });
    expect(await client.get(`inv:local:user:${USER}`)).toBe("sub_live");
  });

  it("does not write the request clock when Lemon omits updated_at", async () => {
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-notime",
        action: "grant",
        reason: "active",
        updatedAtMs: null,
        eventTime: null,
      }),
    );
    const record = await readSub("inv:local:", "sub_race");
    expect(record?.updatedAtMs).toBe(0);
    expect(record?.updatedAt).toBe("");
    expect(record?.updatedAtMs).not.toBe(NOW);
  });

  it("keeps preview and production keys apart", async () => {
    await apply(
      "inv:preview:",
      spec({
        eventId: "evt-preview",
        action: "grant",
        reason: "active",
        subjectId: "sub_shared",
        renewsAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    await apply(
      "inv:production:",
      spec({
        eventId: "evt-prod",
        action: "grant",
        reason: "active",
        subjectId: "sub_shared",
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
    );
    expect(await readSub("inv:preview:", "sub_shared")).toMatchObject({ renewsAt: "2026-11-01T00:00:00.000Z" });
    expect(await readSub("inv:production:", "sub_shared")).toMatchObject({ renewsAt: "2027-01-01T00:00:00.000Z" });
  });

  const PERIOD = "2026-12-01T00:00:00.000Z";
  const RENEW_AT = "2026-11-01T00:00:00.000Z";
  const RENEW_LATER = "2026-11-01T00:00:01.000Z";

  async function seedRefunded() {
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-created",
        action: "grant",
        reason: "active",
        updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
        eventTime: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    await apply(
      "inv:local:",
      spec({
        eventId: "evt-refund",
        action: "revoke",
        reason: "refunded",
        refund: true,
        status: "refunded",
        dateMode: "set",
        endsAt: "2026-10-02T00:00:00.000Z",
        renewsAt: null,
        updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
        eventTime: "2026-10-02T00:00:00.000Z",
      }),
    );
  }

  function renewal(eventId: string, at: string) {
    return spec({
      eventId,
      action: "grant",
      reason: "active",
      dateMode: "fill",
      status: "active",
      endsAt: null,
      renewsAt: PERIOD,
      updatedAtMs: Date.parse(at),
      eventTime: at,
    });
  }

  function payment(eventId: string, at: string) {
    return spec({
      eventId,
      action: "grant",
      reason: "payment_success",
      dateMode: "fill",
      status: "paid",
      plan: null,
      variantId: null,
      reuseStoredPlan: true,
      amounts: [],
      endsAt: null,
      renewsAt: null,
      updatedAtMs: Date.parse(at),
      eventTime: at,
    });
  }

  async function expectPro() {
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: false,
      active: true,
      renewsAt: PERIOD,
      endsAt: null,
    });
  }

  it("regrants when the renewal update arrives one second before payment_success", async () => {
    await seedRefunded();
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: true,
      endsAt: "2026-10-02T00:00:00.000Z",
      refundEndsAt: "2026-10-02T00:00:00.000Z",
    });
    const updated = await apply("inv:local:", renewal("evt-2", RENEW_AT));
    expect(updated).toMatchObject({ result: "applied" });
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: true,
      active: false,
      renewsAt: PERIOD,
      endsAt: null,
    });
    const paid = await apply("inv:local:", payment("evt-1", RENEW_LATER));
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    await expectPro();
  });

  it("regrants when payment_success arrives one second before the renewal update", async () => {
    await seedRefunded();
    const paid = await apply("inv:local:", payment("evt-2", RENEW_AT));
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: false,
      active: false,
      renewsAt: null,
      endsAt: null,
    });
    const updated = await apply("inv:local:", renewal("evt-1", RENEW_LATER));
    expect(updated).toMatchObject({ result: "applied" });
    await expectPro();
  });

  it("regrants when the renewal update and payment_success share a second and the update is stored first", async () => {
    await seedRefunded();
    const updated = await apply("inv:local:", renewal("evt-2", RENEW_AT));
    const paid = await apply("inv:local:", payment("evt-1", RENEW_AT));
    expect(updated).toMatchObject({ result: "applied" });
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    await expectPro();
  });

  it("regrants when payment_success and the renewal update share a second and the payment is stored first", async () => {
    await seedRefunded();
    const paid = await apply("inv:local:", payment("evt-2", RENEW_AT));
    const updated = await apply("inv:local:", renewal("evt-1", RENEW_AT));
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(updated).toMatchObject({ result: "applied" });
    await expectPro();
  });

  it("lets a same-second refund beat payment_success in either order", async () => {
    const at = "2026-10-02T00:00:00.000Z";
    const paid = spec({
      eventId: "evt-2",
      action: "grant",
      reason: "payment_success",
      updatedAtMs: Date.parse(at),
      eventTime: at,
      renewsAt: PERIOD,
      endsAt: null,
    });
    const refund = spec({
      eventId: "evt-1",
      action: "revoke",
      reason: "refunded",
      refund: true,
      status: "refunded",
      dateMode: "set",
      renewsAt: null,
      endsAt: at,
      updatedAtMs: Date.parse(at),
      eventTime: at,
    });
    for (const order of [
      [paid, refund],
      [refund, paid],
    ]) {
      await client.flushDb();
      for (const item of order) await apply("inv:local:", item);
      expect(await readSub("inv:local:", "sub_race")).toMatchObject({
        refunded: true,
        active: false,
        eventId: "evt-1",
      });
    }
  });

  const ATTACH_ENV = {
    VERCEL_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  };
  const EXTRA = OTHER;
  const THIRD = "cccccccccccccccccccccccccccccccc";
  const FOURTH = "dddddddddddddddddddddddddddddddd";

  function command(): RedisCommand {
    return async (args) => {
      const [op, script, numkeys, ...tail] = args;
      if (op !== "EVAL" || script === undefined || numkeys === undefined) throw new Error(op ?? "missing");
      const count = Number(numkeys);
      return client.eval(script, { keys: tail.slice(0, count), arguments: tail.slice(count) });
    };
  }

  async function seedAttachable() {
    await apply(
      "inv:production:",
      spec({
        eventId: "evt-created",
        action: "grant",
        reason: "active",
        subjectId: "sub_1",
        userId: USER,
        orderId: "4242",
        renewsAt: "2099-01-01T00:00:00.000Z",
        updatedAtMs: Date.parse("2026-10-01T00:00:00.000Z"),
        eventTime: "2026-10-01T00:00:00.000Z",
      }),
    );
  }

  function attachRefund() {
    return spec({
      eventId: "evt-refund",
      action: "revoke",
      reason: "refunded",
      refund: true,
      status: "refunded",
      dateMode: "set",
      subjectId: "sub_1",
      userId: USER,
      orderId: "4242",
      endsAt: "2026-10-02T00:00:00.000Z",
      renewsAt: null,
      updatedAtMs: Date.parse("2026-10-02T00:00:00.000Z"),
      eventTime: "2026-10-02T00:00:00.000Z",
    });
  }

  async function attach(installId: string) {
    return attachDevice({
      env: ATTACH_ENV,
      subscriptionId: "sub_1",
      installId,
      orderId: "4242",
      command: command(),
      nowMs: NOW,
    });
  }

  it("appends a device in one eval after the order matches", async () => {
    await seedAttachable();
    const result = await attach(EXTRA.toUpperCase());
    expect(result).toEqual({ ok: true, devices: [USER, EXTRA] });
    expect(await readSub("inv:production:", "sub_1")).toMatchObject({
      userId: USER,
      devices: [USER, EXTRA],
      refunded: false,
      renewsAt: "2099-01-01T00:00:00.000Z",
    });
    expect(await client.get(`inv:production:user:${EXTRA}`)).toBe("sub_1");
    expect(JSON.parse((await client.get(`inv:production:idx:${EXTRA}`)) ?? "[]")).toEqual(["sub_1"]);
  });

  it("does not write when the order belongs to another subscription or the device cap is full", async () => {
    await seedAttachable();
    await client.set("inv:production:order:9999", JSON.stringify({ subscriptionId: "sub_other" }));
    await expect(
      attachDevice({
        env: ATTACH_ENV,
        subscriptionId: "sub_1",
        installId: EXTRA,
        orderId: "9999",
        command: command(),
        nowMs: NOW,
      }),
    ).resolves.toEqual({ ok: false, reason: "order_mismatch" });
    expect(await client.get(`inv:production:user:${EXTRA}`)).toBeNull();

    await attach(EXTRA);
    await attach(THIRD);
    const before = await client.get("inv:production:sub:sub_1");
    await expect(attach(FOURTH)).resolves.toEqual({ ok: false, reason: "device_cap" });
    expect(await client.get("inv:production:sub:sub_1")).toBe(before);
    expect(await client.get(`inv:production:user:${FOURTH}`)).toBeNull();
  });

  it("does not add a device after a refund, and a later refund keeps the device", async () => {
    await seedAttachable();
    await apply("inv:production:", attachRefund());
    await expect(attach(EXTRA)).resolves.toEqual({ ok: false, reason: "refunded" });
    expect(await readSub("inv:production:", "sub_1")).toMatchObject({
      refunded: true,
      active: false,
      devices: [USER],
    });
    expect(await client.get(`inv:production:user:${EXTRA}`)).toBeNull();

    await client.flushDb();
    await seedAttachable();
    expect(await attach(EXTRA)).toEqual({ ok: true, devices: [USER, EXTRA] });
    await apply("inv:production:", attachRefund());
    expect(await readSub("inv:production:", "sub_1")).toMatchObject({
      refunded: true,
      active: false,
      devices: [USER, EXTRA],
    });
  });

  it("does not let a concurrent refund get overwritten by attach", async () => {
    await seedAttachable();
    const [attached] = await Promise.all([attach(EXTRA), apply("inv:production:", attachRefund())]);
    const record = await readSub("inv:production:", "sub_1");
    expect(record).toMatchObject({ refunded: true, active: false });
    if (attached.ok) {
      expect(record?.devices).toEqual([USER, EXTRA]);
    } else {
      expect(attached.reason).toBe("refunded");
      expect(record?.devices).toEqual([USER]);
    }
  });
});
