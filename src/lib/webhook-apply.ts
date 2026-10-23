import { LEMON_PRICE_CENTS, type CheckoutPlan } from "./lemon-config";
import type { EntitlementRecord } from "./entitlement-store";
import type { DateMode, LicenseAction } from "./lemon-license";

export type PersistResult = {
  result: "applied" | "duplicate" | "stale" | "ignored";
  action: LicenseAction | "duplicate" | "stale";
  variantId: string | null;
  reason: string;
};

/**
 * Equal Lemon `updated_at` values are second precision, so the last arrival
 * must not win. Higher precedence wins a tie. A remaining tie goes to the
 * lexicographically greater `meta.webhook_id`.
 *
 * refunded (50) > expired / license_disabled (40) > other revoke (30) >
 * pause / no_extend (20) > grant (10). `payment_success` stays a grant.
 * Raising it would make a same-second renewal stale, so that renewal would
 * never store `renews_at`. Two exceptions cover that tie instead: a payment
 * that clears a refund wins the webhook-id comparison, and a grant that
 * carries `renews_at` or `ends_at` still applies when it shares the
 * millisecond of the payment that just cleared the refund.
 */
export function eventPrecedence(input: { action: string; reason: string; status?: string | null }): number {
  if (input.reason === "refunded") return 50;
  if (input.reason === "expired" || input.reason === "license_disabled" || input.status === "expired") return 40;
  if (input.action === "revoke") return 30;
  if (input.action === "pause" || input.action === "no_extend") return 20;
  return 10;
}

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
  /** Lemon `updated_at` or `created_at` in milliseconds. Null when Lemon sent neither. */
  updatedAtMs: number | null;
  nowMs: number;
  /** Request clock. Never written onto the subscription. */
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
  /** Lemon `updated_at` or `created_at`. Null when Lemon sent neither. */
  eventTime: string | null;
};

export type WebhookState = {
  records: Map<string, EntitlementRecord>;
  index: Map<string, string[]>;
  events: Set<string>;
  /** Lemon order id → subscription id. Orders have no subscription_id of their own. */
  orders: Map<string, string>;
};

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function deviceIds(record: Pick<EntitlementRecord, "userId" | "devices"> | null | undefined): string[] {
  if (!record) return [];
  if (record.devices && record.devices.length > 0) return [...record.devices];
  return record.userId ? [record.userId] : [];
}

function accessEndMs(record: Pick<EntitlementRecord, "endsAt" | "renewsAt">): number {
  const until = record.endsAt ?? record.renewsAt;
  if (!until || !until.endsWith("Z")) return 0;
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
    if (record && deviceIds(record).includes(userId)) records.push(record);
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
  const devices = deviceIds(record);
  const stored: EntitlementRecord = {
    ...record,
    devices,
    userId: devices[0] ?? record.userId,
  };
  const previous = state.records.get(record.subscriptionId);
  for (const id of deviceIds(previous)) {
    if (!devices.includes(id)) removeFromIndex(state, id, record.subscriptionId);
  }
  state.records.set(record.subscriptionId, stored);
  for (const id of devices) addToIndex(state, id, record.subscriptionId);
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

function paymentClearsRefund(existing: EntitlementRecord, spec: WebhookSpec): boolean {
  return Boolean(existing.refunded) && spec.action === "grant" && spec.reason === "payment_success";
}

function grantFillsClearedRefund(existing: EntitlementRecord, spec: WebhookSpec, incomingMs: number): boolean {
  if (spec.action !== "grant" || spec.reason === "payment_success") return false;
  if (!spec.renewsAt && !spec.endsAt) return false;
  return existing.refundClearedAtMs != null && existing.refundClearedAtMs === incomingMs;
}

function incomingIsStale(existing: EntitlementRecord, spec: WebhookSpec, precedence: number): boolean {
  const storedMs = existing.updatedAtMs ?? 0;
  const incomingMs = spec.updatedAtMs ?? storedMs;
  if (incomingMs !== storedMs) return incomingMs < storedMs;
  const storedPrec = existing.precedence ?? 0;
  if (precedence !== storedPrec) return precedence < storedPrec;
  if (paymentClearsRefund(existing, spec)) return false;
  if (grantFillsClearedRefund(existing, spec, incomingMs)) return false;
  const incomingId = spec.eventId ?? "";
  const storedId = existing.eventId ?? "";
  return incomingId <= storedId;
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
  let existing = subscriptionId ? (state.records.get(subscriptionId) ?? null) : null;

  if (!subscriptionId && spec.orderId) {
    if (ORDER_ID_PATTERN.test(spec.orderId)) {
      const mapped = state.orders.get(spec.orderId);
      if (mapped) {
        subscriptionId = mapped;
        existing = state.records.get(mapped) ?? null;
      }
    }
    if (!subscriptionId) return ignored(spec, "missing_subscription");
  }

  if (!existing && !subscriptionId && !spec.orderId && spec.userId && spec.action === "revoke") {
    existing = bestForUser(state, spec.userId, spec.nowMs);
    subscriptionId = existing?.subscriptionId ?? null;
  }

  const precedence = eventPrecedence(spec);
  if (existing && incomingIsStale(existing, spec, precedence)) {
    return {
      result: "stale",
      action: "stale",
      variantId: spec.variantId ?? existing.variantId,
      reason: "stale_event",
    };
  }

  const holdRefund =
    Boolean(existing?.refunded) && spec.action === "grant" && spec.reason !== "payment_success";

  const devices = deviceIds(existing);
  if (devices.length === 0 && spec.userId) devices.push(spec.userId);
  if (devices.length === 0) return ignored(spec, "missing_user");
  if (!subscriptionId) return ignored(spec, "missing_subscription");
  const userId = devices[0]!;

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

  // A refund's endsAt is the refund time, which would hide a later renews_at.
  // Keep the new period, but leave Pro off until payment_success clears the refund.
  if (holdRefund) {
    if (spec.renewsAt) endsAt = spec.endsAt;
    active = false;
  }

  const updatedAtMs = spec.updatedAtMs ?? existing?.updatedAtMs ?? 0;
  let refunded = Boolean(existing?.refunded);
  let refundEndsAt = existing?.refundEndsAt ?? null;
  let refundClearedAtMs = existing?.refundClearedAtMs ?? null;
  if (spec.refund) {
    refunded = true;
    refundEndsAt = endsAt;
    refundClearedAtMs = null;
  }
  if (spec.action === "grant" && spec.reason === "payment_success") {
    const wasRefunded = refunded;
    refunded = false;
    if (wasRefunded && !spec.endsAt) {
      if (refundEndsAt) {
        if (endsAt === refundEndsAt) endsAt = null;
      } else if (!renewsAt) {
        endsAt = null;
      }
    }
    if (wasRefunded) {
      active = accessIsFuture(endsAt, renewsAt, spec.nowMs);
      refundClearedAtMs = updatedAtMs;
    }
  }

  const record: EntitlementRecord = {
    subscriptionId,
    userId,
    devices,
    plan,
    variantId,
    status: spec.status ?? spec.reason,
    active,
    endsAt,
    renewsAt,
    updatedAt: spec.eventTime ?? existing?.updatedAt ?? "",
    updatedAtMs,
    refunded,
    refundEndsAt,
    refundClearedAtMs,
    precedence,
    eventId: spec.eventId,
  };
  putRecord(state, record);
  if (spec.orderId && ORDER_ID_PATTERN.test(spec.orderId)) {
    state.orders.set(spec.orderId, subscriptionId);
  }
  return { result: "applied", action: spec.action, variantId, reason: spec.reason };
}
