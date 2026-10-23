import type { CheckoutPlan } from "./lemon-config";
import type { PersistResult, StoredOrder, WebhookSpec, WebhookState } from "./webhook-apply";
import { applyWebhookState, bestForUser, putRecord, rebindState } from "./webhook-apply";
import { EVENT_TTL_SECONDS, REBIND_LUA, WEBHOOK_LUA } from "./webhook-lua";

export type EntitlementRecord = {
  subscriptionId: string;
  userId: string;
  plan: CheckoutPlan;
  variantId: string;
  status: string;
  active: boolean;
  endsAt: string | null;
  renewsAt: string | null;
  updatedAt: string;
  updatedAtMs: number;
  /** Set when a refund lands. Later active updates must not clear it. */
  refunded?: boolean;
};

export interface EntitlementStore {
  getByUserId(userId: string): Promise<EntitlementRecord | null>;
  getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null>;
  save(record: EntitlementRecord): Promise<void>;
  hasEvent(eventId: string): Promise<boolean>;
  markEvent(eventId: string): Promise<void>;
  applyWebhook(spec: WebhookSpec): Promise<PersistResult>;
  rebindInstall(record: EntitlementRecord): Promise<"applied" | "refunded">;
  getOrder(orderId: string): Promise<StoredOrder | null>;
}

export class EntitlementStoreNotConfiguredError extends Error {
  constructor() {
    super("Entitlement store is not configured");
    this.name = "EntitlementStoreNotConfiguredError";
  }
}

export class MemoryEntitlementStore implements EntitlementStore {
  private readonly state: WebhookState = {
    records: new Map(),
    index: new Map(),
    events: new Set(),
    orders: new Map(),
  };
  private queue: Promise<unknown> = Promise.resolve();

  private serialized<T>(work: () => T): Promise<T> {
    const run = this.queue.then(() => work());
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null> {
    return this.serialized(() => this.state.records.get(subscriptionId) ?? null);
  }

  async getByUserId(userId: string): Promise<EntitlementRecord | null> {
    return this.serialized(() => bestForUser(this.state, userId, Date.now()));
  }

  async save(record: EntitlementRecord): Promise<void> {
    await this.serialized(() => {
      putRecord(this.state, record);
    });
  }

  async hasEvent(eventId: string): Promise<boolean> {
    return this.serialized(() => this.state.events.has(eventId));
  }

  async markEvent(eventId: string): Promise<void> {
    await this.serialized(() => {
      if (eventId) this.state.events.add(eventId);
    });
  }

  async applyWebhook(spec: WebhookSpec): Promise<PersistResult> {
    return this.serialized(() => applyWebhookState(this.state, spec));
  }

  async rebindInstall(record: EntitlementRecord): Promise<"applied" | "refunded"> {
    return this.serialized(() => rebindState(this.state, record));
  }

  async getOrder(orderId: string): Promise<StoredOrder | null> {
    return this.serialized(() => this.state.orders.get(orderId) ?? null);
  }
}

type FetchLike = typeof fetch;

/**
 * Upstash Redis REST API. The free tier is enough: one key per subscription,
 * one key per install id, and a short-lived key per webhook id.
 */
export class UpstashEntitlementStore implements EntitlementStore {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async command<T>(args: string[]): Promise<T> {
    const response = await this.fetchImpl(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Entitlement store request failed");
    }
    const body = (await response.json()) as { result?: T; error?: string };
    if (body.error) {
      throw new Error("Entitlement store request failed");
    }
    return body.result as T;
  }

  private subKey(subscriptionId: string): string {
    return `inv:sub:${subscriptionId}`;
  }

  private userKey(userId: string): string {
    return `inv:user:${userId}`;
  }

  private eventKey(eventId: string): string {
    return `inv:event:${eventId}`;
  }

  private readJson<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as T;
    } catch {
      return null;
    }
  }

  private async readRecord(subscriptionId: string): Promise<EntitlementRecord | null> {
    const parsed = this.readJson<EntitlementRecord>(
      await this.command<string | null>(["GET", this.subKey(subscriptionId)]),
    );
    if (!parsed) return null;
    return {
      ...parsed,
      endsAt: parsed.endsAt || null,
      renewsAt: parsed.renewsAt || null,
    };
  }

  async getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null> {
    return this.readRecord(subscriptionId);
  }

  async getByUserId(userId: string): Promise<EntitlementRecord | null> {
    const subscriptionId = await this.command<string | null>(["GET", this.userKey(userId)]);
    if (!subscriptionId) return null;
    const record = await this.readRecord(subscriptionId);
    if (!record || record.userId !== userId) return null;
    return record;
  }

  async save(record: EntitlementRecord): Promise<void> {
    const body = JSON.stringify(record);
    await this.command(["SET", this.subKey(record.subscriptionId), body]);
    await this.command(["SET", this.userKey(record.userId), record.subscriptionId]);
  }

  async hasEvent(eventId: string): Promise<boolean> {
    const value = await this.command<string | null>(["GET", this.eventKey(eventId)]);
    return value !== null && value !== undefined;
  }

  async markEvent(eventId: string): Promise<void> {
    if (!eventId) return;
    await this.command(["SET", this.eventKey(eventId), "1", "EX", String(EVENT_TTL_SECONDS)]);
  }

  async applyWebhook(spec: WebhookSpec): Promise<PersistResult> {
    const payload = JSON.stringify({
      ...spec,
      eventId: spec.eventId ?? "",
      plan: spec.plan ?? "",
      variantId: spec.variantId ?? "",
      subjectId: spec.subjectId ?? "",
      userId: spec.userId ?? "",
      endsAt: spec.endsAt ?? "",
      renewsAt: spec.renewsAt ?? "",
      status: spec.status ?? "",
      currency: spec.currency ?? "",
      orderId: spec.orderId ?? "",
      emailHash: spec.emailHash ?? "",
      eventTime: spec.eventTime ?? "",
    });
    try {
      const raw = await this.command<string>(["EVAL", WEBHOOK_LUA, "1", "inv:webhook", String(EVENT_TTL_SECONDS), payload]);
      return parsePersistResult(raw);
    } catch (error) {
      if (spec.eventId) {
        try {
          await this.command(["DEL", this.eventKey(spec.eventId)]);
        } catch {
          /* The claim rolls back with a failed EVAL. A lost response can still retry. */
        }
      }
      throw error;
    }
  }

  async rebindInstall(record: EntitlementRecord): Promise<"applied" | "refunded"> {
    const raw = await this.command<string>([
      "EVAL",
      REBIND_LUA,
      "1",
      "inv:webhook",
      JSON.stringify({ ...record, nowMs: Date.now(), endsAt: record.endsAt ?? "", renewsAt: record.renewsAt ?? "" }),
    ]);
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as { result?: string }) : (raw as { result?: string });
    return parsed.result === "refunded" ? "refunded" : "applied";
  }

  async getOrder(orderId: string): Promise<StoredOrder | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(orderId)) return null;
    return this.readJson<StoredOrder>(await this.command<string | null>(["GET", `inv:order:${orderId}`]));
  }
}

function parsePersistResult(raw: unknown): PersistResult {
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!value || typeof value !== "object") throw new Error("Entitlement store request failed");
  const body = value as { result?: string; action?: string; variantId?: string; reason?: string };
  if (body.result !== "applied" && body.result !== "duplicate" && body.result !== "stale" && body.result !== "ignored") {
    throw new Error("Entitlement store request failed");
  }
  const action = body.action;
  if (
    action !== "grant" &&
    action !== "revoke" &&
    action !== "pause" &&
    action !== "no_extend" &&
    action !== "ignore" &&
    action !== "duplicate" &&
    action !== "stale"
  ) {
    throw new Error("Entitlement store request failed");
  }
  return {
    result: body.result,
    action,
    variantId: body.variantId ? body.variantId : null,
    reason: body.reason ?? body.result,
  };
}

const DEV_STORE_KEY = "__invoiceEntitlementMemory";
let storeOverride: EntitlementStore | null = null;

function devMemory(): MemoryEntitlementStore {
  const globalRecord = globalThis as typeof globalThis & {
    [DEV_STORE_KEY]?: MemoryEntitlementStore;
  };
  if (!globalRecord[DEV_STORE_KEY]) {
    globalRecord[DEV_STORE_KEY] = new MemoryEntitlementStore();
  }
  return globalRecord[DEV_STORE_KEY];
}

export function setEntitlementStoreForTests(store: EntitlementStore | null): void {
  storeOverride = store;
}

function restCredentials(env: Record<string, string | undefined>): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function getEntitlementStore(env: Record<string, string | undefined> = process.env): EntitlementStore {
  if (storeOverride) return storeOverride;
  const credentials = restCredentials(env);
  if (credentials) return new UpstashEntitlementStore(credentials.url, credentials.token);
  if (env.NODE_ENV === "production") throw new EntitlementStoreNotConfiguredError();
  return devMemory();
}

/** Pro is on only while the stored Lemon period (`ends_at`, else `renews_at`) is still in the future. */
export function recordIsActive(record: EntitlementRecord, now = new Date()): boolean {
  if (!record.active) return false;
  const until = record.endsAt ?? record.renewsAt;
  if (!until) return false;
  const time = Date.parse(until);
  return !Number.isNaN(time) && time > now.getTime();
}
