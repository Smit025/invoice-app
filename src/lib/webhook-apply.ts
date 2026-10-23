import { LEMON_PRICE_CENTS, type CheckoutPlan } from "./lemon-config";
import type { EntitlementRecord } from "./entitlement-store";
import type { DateMode, LicenseAction } from "./lemon-license";

export type PersistResult = {
  result: "applied" | "duplicate" | "stale" | "ignored";
  action: LicenseAction | "duplicate" | "stale";
  variantId: string | null;
  reason: string;
};

export type StoredOrder = {
  subscriptionId: string;
  emailHash: string;
};

/** Fields the atomic webhook script needs. Nulls are already resolved by the caller. */
export type WebhookSpec = {
  eventId: string | null;
  action: Exclude<LicenseAction, "ignore">;
  dateMode: DateMode;
  plan: CheckoutPlan | null;
  variantId: string | null;
  subjectId: string | null;
  userId: string | null;
  endsAt: string | null;
  renewsAt: string | null;
  updatedAtMs: number;
  nowMs: number;
  nowIso: string;
  status: string | null;
  reason: string;
  /** This event is a refund and must stick against later active updates. */
  refund: boolean;
  currency: string | null;
  /**
   * Amounts present on the payload. An empty list matches any plan: missing
   * money fields are only a secondary check and do not identify a product.
   */
  amounts: number[];
  /** payment_success, and any non-grant, may reuse the stored subscription's variant. */
  reuseStoredPlan: boolean;
  orderId: string | null;
  emailHash: string | null;
  eventTime: string | null;
};

export type WebhookState = {
  records: Map<string, EntitlementRecord>;
  index: Map<string, string[]>;
  events: Set<string>;
  orders: Map<string, StoredOrder>;
};

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function accessEndMs(record: Pick<EntitlementRecord, "endsAt" | "renewsAt">): number {
  const until = record.endsAt ?? record.renewsAt;
  if (!until) return 0;
  const time = Date.parse(until);
  return Number.isNaN(time) ? 0 : time;
}

function rank(record: EntitlementRecord, nowMs: number): [number, number, number] {
  const end = accessEndMs(record);
  const active = Boolean(record.active) && !record.refunded && end > nowMs;
  const tier = active ? (record.subscriptionId.startsWith("license:") ? 1 : 2) : 0;
  return [tier, active ? end : 0, record.updatedAtMs];
}

/** Positive when `a` is the better entitlement. Active subscriptions outrank licenses. */
export function compareEntitlement(a: EntitlementRecord, b: EntitlementRecord, nowMs: number): number {
  const [tierA, endA, updatedA] = rank(a, nowMs);
  const [tierB, endB, updatedB] = rank(b, nowMs);
  if (tierA !== tierB) return tierA - tierB;
  if (endA !== endB) return endA - endB;
  return updatedA - updatedB;
}

export function chooseBest(records: readonly EntitlementRecord[], nowMs: number): EntitlementRecord | null {
  if (records.length === 0) return null;
  return [...records].sort((a, b) => compareEntitlement(b, a, nowMs))[0] ?? null;
}

export function bestForUser(state: WebhookState, userId: string, nowMs: number): EntitlementRecord | null {
  const ids = state.index.get(userId) ?? [];
  const records: EntitlementRecord[] = [];
  for (const id of ids) {
    const record = state.records.get(id);
    if (record && record.userId === userId) records.push(record);
  }
  return chooseBest(records, nowMs);
}

function removeFromIndex(state: WebhookState, userId: string, subscriptionId: string): void {
  const ids = state.index.get(userId);
  if (!ids) return;
  const next = ids.filter((id) => id !== subscriptionId);
  if (next.length === 0) state.index.delete(userId);
  else state.index.set(userId, next);
}

function addToIndex(state: WebhookState, userId: string, subscriptionId: string): void {
  const ids = state.index.get(userId) ?? [];
  if (!ids.includes(subscriptionId)) ids.push(subscriptionId);
  state.index.set(userId, ids);
}

export function putRecord(state: WebhookState, record: EntitlementRecord): void {
  const previous = state.records.get(record.subscriptionId);
  if (previous && previous.userId !== record.userId) {
    removeFromIndex(state, previous.userId, record.subscriptionId);
  }
  state.records.set(record.subscriptionId, record);
  addToIndex(state, record.userId, record.subscriptionId);
}

function mergeDate(mode: DateMode, incoming: string | null, existing: string | null | undefined): string | null {
  if (mode === "keep") return existing ?? null;
  if (mode === "set") return incoming;
  return incoming ?? existing ?? null;
}

function accessIsFuture(endsAt: string | null, renewsAt: string | null, nowMs: number): boolean {
  return accessEndMs({ endsAt, renewsAt }) > nowMs;
}

function priceMatches(plan: CheckoutPlan, currency: string | null, amounts: number[]): boolean {
  if (currency && currency.toUpperCase() !== "USD") return false;
  if (amounts.length === 0) return true;
  const expected = LEMON_PRICE_CENTS[plan];
  return amounts.some((cents) => cents === expected);
}

function ignored(spec: WebhookSpec, reason: string, variantId: string | null = spec.variantId): PersistResult {
  return { result: "ignored", action: "ignore", variantId, reason };
}

/**
 * One in-process compare-and-set. Callers must not interleave this with other
 * writers on the same state. The Upstash store runs the same steps in one Lua script.
 */
export function applyWebhookState(state: WebhookState, spec: WebhookSpec): PersistResult {
  if (spec.eventId) {
    if (state.events.has(spec.eventId)) {
      return { result: "duplicate", action: "duplicate", variantId: spec.variantId, reason: "duplicate_event" };
    }
    state.events.add(spec.eventId);
  }

  let subscriptionId = spec.subjectId;
  let existing = subscriptionId ? state.records.get(subscriptionId) ?? null : null;
  if (!existing && spec.userId && spec.action === "revoke") {
    existing = bestForUser(state, spec.userId, spec.nowMs);
    if (!subscriptionId) subscriptionId = existing?.subscriptionId ?? null;
  }

  if (existing && spec.updatedAtMs < existing.updatedAtMs) {
    return {
      result: "stale",
      action: "stale",
      variantId: spec.variantId ?? existing.variantId,
      reason: "stale_event",
    };
  }

  if (existing && spec.userId && existing.userId !== spec.userId) {
    return ignored(spec, "user_mismatch");
  }

  if (existing?.refunded && spec.action === "grant" && spec.reason !== "payment_success") {
    return ignored(spec, "refunded", spec.variantId ?? existing.variantId);
  }

  const userId = spec.userId ?? existing?.userId ?? null;
  if (!userId || !subscriptionId) {
    return ignored(spec, userId ? "missing_subscription" : "missing_user");
  }

  let plan = spec.plan;
  let variantId = spec.variantId;
  if (!plan || !variantId) {
    const allowReuse = spec.reuseStoredPlan || spec.action !== "grant";
    if (!existing || !allowReuse || !existing.plan || !existing.variantId) {
      return ignored(spec, "unknown_variant", variantId);
    }
    if (!priceMatches(existing.plan, spec.currency, spec.amounts)) {
      return ignored(spec, "price_mismatch", existing.variantId);
    }
    plan = existing.plan;
    variantId = existing.variantId;
  }

  let endsAt = spec.endsAt;
  let renewsAt = spec.renewsAt;
  let active = false;
  if (spec.action === "no_extend") {
    endsAt = existing?.endsAt ?? null;
    renewsAt = existing?.renewsAt ?? null;
    active = Boolean(existing?.active) && accessIsFuture(endsAt, renewsAt, spec.nowMs);
  } else if (spec.action === "pause") {
    endsAt = existing?.endsAt ?? null;
    renewsAt = existing?.renewsAt ?? null;
    active = false;
  } else if (spec.action === "revoke") {
    endsAt = mergeDate(spec.dateMode, spec.endsAt, existing?.endsAt);
    renewsAt = mergeDate(spec.dateMode, spec.renewsAt, existing?.renewsAt);
    active = false;
  } else {
    endsAt = mergeDate(spec.dateMode, spec.endsAt, existing?.endsAt);
    renewsAt = mergeDate(spec.dateMode, spec.renewsAt, existing?.renewsAt);
    active = accessIsFuture(endsAt, renewsAt, spec.nowMs);
  }

  let refunded = Boolean(existing?.refunded);
  if (spec.refund) refunded = true;
  if (spec.action === "grant" && spec.reason === "payment_success") refunded = false;

  const record: EntitlementRecord = {
    subscriptionId,
    userId,
    plan,
    variantId,
    status: spec.status ?? spec.reason,
    active,
    endsAt,
    renewsAt,
    updatedAt: spec.eventTime ?? spec.nowIso,
    updatedAtMs: spec.updatedAtMs,
    refunded,
  };
  putRecord(state, record);
  if (spec.orderId && spec.emailHash && ORDER_ID_PATTERN.test(spec.orderId)) {
    state.orders.set(spec.orderId, { subscriptionId, emailHash: spec.emailHash });
  }
  return { result: "applied", action: spec.action, variantId, reason: spec.reason };
}

export function rebindState(state: WebhookState, record: EntitlementRecord): "applied" | "refunded" {
  const existing = state.records.get(record.subscriptionId);
  if (existing?.refunded) return "refunded";
  putRecord(state, { ...existing, ...record, refunded: false });
  return "applied";
}
