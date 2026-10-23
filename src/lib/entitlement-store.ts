import type { CheckoutPlan } from "./lemon-config";

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
};

export interface EntitlementStore {
  getByUserId(userId: string): Promise<EntitlementRecord | null>;
  getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null>;
  save(record: EntitlementRecord): Promise<void>;
  hasEvent(eventId: string): Promise<boolean>;
  markEvent(eventId: string): Promise<void>;
}

export class EntitlementStoreNotConfiguredError extends Error {
  constructor() {
    super("Entitlement store is not configured");
    this.name = "EntitlementStoreNotConfiguredError";
  }
}

const EVENT_TTL_SECONDS = 60 * 60 * 24 * 45;

export class MemoryEntitlementStore implements EntitlementStore {
  private readonly bySub = new Map<string, EntitlementRecord>();
  private readonly byUser = new Map<string, string>();
  private readonly events = new Set<string>();

  async getBySubscriptionId(subscriptionId: string): Promise<EntitlementRecord | null> {
    return this.bySub.get(subscriptionId) ?? null;
  }

  async getByUserId(userId: string): Promise<EntitlementRecord | null> {
    const subscriptionId = this.byUser.get(userId);
    if (!subscriptionId) return null;
    const record = this.bySub.get(subscriptionId);
    if (!record || record.userId !== userId) return null;
    return record;
  }

  async save(record: EntitlementRecord): Promise<void> {
    const previous = this.bySub.get(record.subscriptionId);
    if (previous && previous.userId !== record.userId) {
      const pointed = this.byUser.get(previous.userId);
      if (pointed === record.subscriptionId) this.byUser.delete(previous.userId);
    }
    this.bySub.set(record.subscriptionId, record);
    this.byUser.set(record.userId, record.subscriptionId);
  }

  async hasEvent(eventId: string): Promise<boolean> {
    return this.events.has(eventId);
  }

  async markEvent(eventId: string): Promise<void> {
    if (eventId) this.events.add(eventId);
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

  private async readRecord(subscriptionId: string): Promise<EntitlementRecord | null> {
    const raw = await this.command<string | null>(["GET", this.subKey(subscriptionId)]);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as EntitlementRecord;
    } catch {
      return null;
    }
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
