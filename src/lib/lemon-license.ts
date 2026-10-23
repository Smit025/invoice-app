import { getLemonEventName, isLemonEntitlementEvent, isLemonTestMode } from "./lemon-webhook";
import {
  getProVariantIds,
  LEMON_PRICE_CENTS,
  planForVariant,
  type CheckoutPlan,
  type EnvMap,
} from "./lemon-config";
import { isInstallUserId } from "./install-id";

export type LicenseAction = "grant" | "revoke" | "pause" | "no_extend" | "ignore";

/** `fill` uses a present event date, `set` writes the event date even when null, `keep` does not move dates. */
export type DateMode = "fill" | "set" | "keep";

export type LemonLicenseDecision = {
  event: string | undefined;
  action: LicenseAction;
  active: boolean;
  plan: CheckoutPlan | null;
  variantId: string | null;
  subjectId: string | null;
  userId: string | null;
  endsAt: string | null;
  renewsAt: string | null;
  dateMode: DateMode;
  eventId: string | null;
  eventTime: string | null;
  status: string | null;
  reason: string;
};

export type ResolveLicenseOptions = {
  now?: Date;
  variants?: { sixMonth: string; monthly: string };
  env?: EnvMap;
  storeId?: string;
  /** Apply `meta.test_mode` events. The webhook sets this only when VERCEL_ENV is preview. */
  allowTestMode?: boolean;
};

function asId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function asCents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.round(Number(value));
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function payloadParts(payload: unknown): {
  meta: Record<string, unknown>;
  data: Record<string, unknown>;
  attributes: Record<string, unknown>;
} {
  const root = readRecord(payload);
  return {
    meta: readRecord(root?.meta) ?? {},
    data: readRecord(root?.data) ?? {},
    attributes: readRecord(readRecord(root?.data)?.attributes) ?? {},
  };
}

function readIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** Variant comes from Lemon's own fields. Custom checkout data is buyer-controlled and ignored. */
export function readLemonVariantId(payload: unknown): string | undefined {
  const { attributes } = payloadParts(payload);
  const firstItem = readRecord(attributes.first_order_item);
  return asId(attributes.variant_id) ?? asId(firstItem?.variant_id);
}

function readUserId(meta: Record<string, unknown>): string | null {
  const custom = readRecord(meta.custom_data);
  const value = custom?.user_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isInstallUserId(trimmed) ? trimmed.toLowerCase() : null;
}

function readEventTime(attributes: Record<string, unknown>): string | null {
  return readIso(attributes.updated_at) ?? readIso(attributes.created_at);
}

export type PriceEvidence = {
  currency: string | null;
  amounts: number[];
};

export function readPriceEvidence(payload: unknown): PriceEvidence {
  const { attributes } = payloadParts(payload);
  const currency = typeof attributes.currency === "string" ? attributes.currency.trim().toUpperCase() : null;
  const amounts: number[] = [];
  for (const key of ["subtotal", "subtotal_usd", "total", "total_usd"] as const) {
    const cents = asCents(attributes[key]);
    if (cents !== undefined) amounts.push(cents);
  }
  const firstItem = readRecord(attributes.first_order_item);
  if (firstItem) {
    for (const key of ["price", "subtotal", "total"] as const) {
      const cents = asCents(firstItem[key]);
      if (cents !== undefined) amounts.push(cents);
    }
  }
  return { currency, amounts };
}

export function readOrderBinding(payload: unknown): { orderId: string | null; email: string | null } {
  const { data, attributes } = payloadParts(payload);
  const email = typeof attributes.user_email === "string" ? attributes.user_email.trim() : "";
  const orderId = asId(attributes.order_id) ?? (data.type === "orders" ? asId(data.id) : undefined);
  return { orderId: orderId ?? null, email: email || null };
}

/**
 * Price and currency are a secondary check once the variant is known.
 * A present currency must be USD, and at least one present amount must match
 * that variant (299 or 799 cents). When no amount fields are present this
 * returns true. Missing money fields do not identify a plan.
 */
export function payloadPriceMatches(payload: unknown, plan: CheckoutPlan): boolean {
  const { currency, amounts } = readPriceEvidence(payload);
  if (currency && currency !== "USD") return false;
  if (amounts.length === 0) return true;
  const expected = LEMON_PRICE_CENTS[plan];
  return amounts.some((cents) => cents === expected);
}

function readSubjectId(payload: unknown, event: string): string | null {
  const { data, attributes } = payloadParts(payload);
  const subscriptionId = asId(attributes.subscription_id);
  if (subscriptionId) return subscriptionId;
  const id = asId(data.id);
  if (!id) return null;
  if (event.startsWith("license_key_")) return `license:${id}`;
  if (data.type === "subscriptions" || event.startsWith("subscription_")) return id;
  return null;
}

function ignore(
  event: string | undefined,
  reason: string,
  extra?: Partial<LemonLicenseDecision>,
): LemonLicenseDecision {
  return {
    event,
    action: "ignore",
    active: false,
    plan: null,
    variantId: null,
    subjectId: null,
    userId: null,
    endsAt: null,
    renewsAt: null,
    dateMode: "keep",
    eventId: null,
    status: null,
    eventTime: null,
    reason,
    ...extra,
  };
}

function accessIsFuture(endsAt: string | null, renewsAt: string | null, now: Date): boolean {
  const until = endsAt ?? renewsAt;
  if (!until) return false;
  const time = Date.parse(until);
  return !Number.isNaN(time) && time > now.getTime();
}

export function resolveLemonLicense(
  payload: unknown,
  options?: ResolveLicenseOptions,
): LemonLicenseDecision {
  const now = options?.now ?? new Date();
  const variants = options?.variants ?? getProVariantIds(options?.env);
  const allowTestMode = options?.allowTestMode ?? options?.env?.VERCEL_ENV === "preview";
  const event = getLemonEventName(payload);

  if (isLemonTestMode(payload) && !allowTestMode) {
    return ignore(event, "test_mode");
  }

  if (!event || !isLemonEntitlementEvent(event)) {
    return ignore(event, "not_a_license_event");
  }

  const { meta, attributes } = payloadParts(payload);
  const eventId = asId(meta.webhook_id) ?? null;
  const eventTime = readEventTime(attributes);
  const userId = readUserId(meta);
  const status = typeof attributes.status === "string" ? attributes.status : null;
  const expectedStoreId = (options?.storeId ?? options?.env?.LEMONSQUEEZY_STORE_ID)?.trim() ?? "";
  const storeId = asId(attributes.store_id);
  const base = { eventId, eventTime, userId, status };

  if (!expectedStoreId || storeId !== expectedStoreId) {
    return ignore(event, "store_mismatch", base);
  }

  const explicitVariant = readLemonVariantId(payload);
  const plan = planForVariant(explicitVariant, variants) ?? null;
  const subjectId = readSubjectId(payload, event);
  const endsAt =
    event.startsWith("license_key_") ? readIso(attributes.expires_at) : readIso(attributes.ends_at);
  const renewsAt = readIso(attributes.renews_at);
  const identified = {
    event,
    ...base,
    plan,
    variantId: explicitVariant ?? null,
    subjectId,
    endsAt,
    renewsAt,
  };

  if (plan && explicitVariant && !payloadPriceMatches(payload, plan)) {
    return ignore(event, "price_mismatch", identified);
  }

  if (explicitVariant && !plan) {
    return ignore(event, "unknown_variant", identified);
  }

  if (
    event === "subscription_payment_refunded" ||
    event === "order_refunded" ||
    status === "refunded"
  ) {
    return {
      ...identified,
      action: "revoke",
      active: false,
      endsAt: now.toISOString(),
      renewsAt: null,
      dateMode: "set",
      reason: "refunded",
    };
  }

  if (event === "subscription_expired" || (status === "expired" && plan && explicitVariant)) {
    return {
      ...identified,
      action: "revoke",
      active: false,
      dateMode: "set",
      reason: "expired",
    };
  }

  if (event === "subscription_resumed" || event === "subscription_unpaused") {
    if (!plan || !explicitVariant) return ignore(event, "unknown_variant", identified);
    const active = accessIsFuture(endsAt, renewsAt, now);
    return {
      ...identified,
      action: "grant",
      active,
      dateMode: "fill",
      reason: event === "subscription_resumed" ? "resumed" : "unpaused",
    };
  }

  if (event === "subscription_paused" || status === "paused") {
    return {
      ...identified,
      action: "pause",
      active: false,
      dateMode: "keep",
      reason: "paused",
    };
  }

  if (event === "subscription_payment_failed" || status === "past_due" || status === "unpaid") {
    return {
      ...identified,
      action: "no_extend",
      active: false,
      dateMode: "keep",
      reason: event === "subscription_payment_failed" ? "payment_failed" : status === "unpaid" ? "unpaid" : "past_due",
    };
  }

  if (event === "subscription_cancelled" || status === "cancelled") {
    if (!plan || !explicitVariant) return ignore(event, "unknown_variant", identified);
    const endsAtTime = endsAt ? Date.parse(endsAt) : undefined;
    if (endsAtTime !== undefined && endsAtTime > now.getTime()) {
      return {
        ...identified,
        action: "grant",
        active: true,
        renewsAt: null,
        dateMode: "set",
        reason: "cancelled_until_period_end",
      };
    }
    return {
      ...identified,
      action: "revoke",
      active: false,
      dateMode: "set",
      reason: "expired",
    };
  }

  if (event === "subscription_payment_success") {
    if (explicitVariant && !plan) return ignore(event, "unknown_variant", identified);
    if (status && status !== "paid") {
      return ignore(event, "payment_not_paid", identified);
    }
    // A real subscription invoice often has subscription_id and no variant_id.
    // The stored subscription supplies the plan when this one is missing.
    return {
      ...identified,
      action: "grant",
      active: accessIsFuture(endsAt, renewsAt, now),
      dateMode: "fill",
      reason: "payment_success",
    };
  }

  if (event === "license_key_created" || event === "license_key_updated") {
    if (!plan || !explicitVariant) return ignore(event, "unknown_variant", identified);
    const endsAtTime = endsAt ? Date.parse(endsAt) : undefined;
    const expired =
      status === "expired" ||
      status === "disabled" ||
      (endsAtTime !== undefined && endsAtTime <= now.getTime());
    if (expired) {
      return {
        ...identified,
        action: "revoke",
        active: false,
        dateMode: "set",
        reason: status === "disabled" ? "license_disabled" : "expired",
      };
    }
    return {
      ...identified,
      action: "grant",
      active: accessIsFuture(endsAt, renewsAt, now),
      dateMode: "fill",
      reason: "license_active",
    };
  }

  if (status === "active" || status === "on_trial" || event === "subscription_created") {
    if (!plan || !explicitVariant) return ignore(event, "unknown_variant", identified);
    return {
      ...identified,
      action: "grant",
      active: accessIsFuture(endsAt, renewsAt, now),
      dateMode: "fill",
      reason: status ?? "active",
    };
  }

  return ignore(event, "unhandled_status", identified);
}
