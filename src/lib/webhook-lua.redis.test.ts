import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type RedisClientType } from "redis";
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

  it("regrants after a refund when the renewal update arrives before payment_success", async () => {
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
    const updated = await apply(
      "inv:local:",
      spec({
        eventId: "evt-renew",
        action: "grant",
        reason: "active",
        dateMode: "fill",
        status: "active",
        endsAt: null,
        renewsAt: "2026-12-01T00:00:00.000Z",
        updatedAtMs: Date.parse("2026-11-01T00:00:00.000Z"),
        eventTime: "2026-11-01T00:00:00.000Z",
      }),
    );
    expect(updated).toMatchObject({ result: "applied" });
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: true,
      active: false,
      renewsAt: "2026-12-01T00:00:00.000Z",
      endsAt: null,
    });

    const paid = await apply(
      "inv:local:",
      spec({
        eventId: "evt-paid",
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
        updatedAtMs: Date.parse("2026-11-01T00:00:01.000Z"),
        eventTime: "2026-11-01T00:00:01.000Z",
      }),
    );
    expect(paid).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(await readSub("inv:local:", "sub_race")).toMatchObject({
      refunded: false,
      active: true,
      renewsAt: "2026-12-01T00:00:00.000Z",
    });
  });
});
