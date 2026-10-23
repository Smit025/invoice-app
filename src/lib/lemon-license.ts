import { getLemonEventName, LEMON_LICENSE_EVENTS } from "./lemon-webhook";
import {
  getProVariantIds,
  LEMON_PRICE_CENTS,
  planForVariant,
  type CheckoutPlan,
  type EnvMap,
} from "./lemon-config";

export type LicenseAction = "grant" | "revoke" | "ignore";

export type LemonLicenseDecision = {
  event: string | undefined;
  action: LicenseAction;
  active: boolean;
  plan: CheckoutPlan | null;
  variantId: string | null;
  subjectId: string | null;
  endsAt: string | null;
  reason: string;
};

export type StoredLicense = {
  plan: CheckoutPlan;
  variantId: string;
  subjectId: string;
  active: boolean;
  endsAt: string | null;
};

const SUBSCRIPTION_EVENTS = new Set<string>([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_payment_success",
]);

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

function parseTime(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
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

function readVariantId(payload: unknown): string | undefined {
  const { meta, attributes } = payloadParts(payload);
  const custom = readRecord(meta.custom_data);
  const firstItem = readRecord(attributes.first_order_item);
  return (
    asId(attributes.variant_id) ??
    asId(firstItem?.variant_id) ??
    asId(custom?.variant_id) ??
    asId(custom?.variantId)
  );
}

function planForPrice(attributes: Record<string, unknown>): CheckoutPlan | undefined {
  const keys = ["subtotal", "subtotal_usd", "total", "total_usd"] as const;
  for (const key of keys) {
    const cents = asCents(attributes[key]);
    if (cents === LEMON_PRICE_CENTS.monthly) return "monthly";
    if (cents === LEMON_PRICE_CENTS.sixMonth) return "sixMonth";
  }
  return undefined;
}

function readSubjectId(payload: unknown, event: string): string | null {
  const { data, attributes } = payloadParts(payload);
  const subscriptionId = asId(attributes.subscription_id);
  if (subscriptionId) return subscriptionId;
  const id = asId(data.id);
  if (!id) return null;
  if (event.startsWith("license_key_")) return `license:${id}`;
  if (data.type === "subscriptions") return id;
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
    endsAt: null,
    reason,
    ...extra,
  };
}

export function resolveLemonLicense(
  payload: unknown,
  options?: { now?: Date; variants?: { sixMonth: string; monthly: string }; env?: EnvMap },
): LemonLicenseDecision {
  const now = options?.now ?? new Date();
  const variants = options?.variants ?? getProVariantIds(options?.env);
  const event = getLemonEventName(payload);
  if (!event || !(LEMON_LICENSE_EVENTS as readonly string[]).includes(event)) {
    return ignore(event, "not_a_license_event");
  }

  const { attributes } = payloadParts(payload);
  const explicitVariant = readVariantId(payload);
  const planFromVariant = planForVariant(explicitVariant, variants);
  const plan = planFromVariant ?? (explicitVariant ? undefined : planForPrice(attributes));
  if (!plan) return ignore(event, "unknown_variant", { variantId: explicitVariant ?? null });

  const variantId = planFromVariant && explicitVariant ? explicitVariant : variants[plan];
  const subjectId = readSubjectId(payload, event);
  const status = typeof attributes.status === "string" ? attributes.status : undefined;
  const endsAtSource =
    event.startsWith("license_key_") ? attributes.expires_at : attributes.ends_at;
  const endsAt = parseTime(endsAtSource) !== undefined && typeof endsAtSource === "string" ? endsAtSource : null;
  const endsAtTime = endsAt ? parseTime(endsAt) : undefined;

  if (event === "subscription_expired") {
    return {
      event,
      action: "revoke",
      active: false,
      plan,
      variantId,
      subjectId,
      endsAt,
      reason: "expired",
    };
  }

  if (event === "subscription_payment_success") {
    if (status && status !== "paid") {
      return ignore(event, "payment_not_paid", { plan, variantId, subjectId });
    }
    return {
      event,
      action: "grant",
      active: true,
      plan,
      variantId,
      subjectId,
      endsAt: null,
      reason: "payment_success",
    };
  }

  if (event === "license_key_created" || event === "license_key_updated") {
    const expired =
      status === "expired" ||
      status === "disabled" ||
      (endsAtTime !== undefined && endsAtTime <= now.getTime());
    if (expired) {
      return {
        event,
        action: "revoke",
        active: false,
        plan,
        variantId,
        subjectId,
        endsAt,
        reason: status === "disabled" ? "license_disabled" : "expired",
      };
    }
    return {
      event,
      action: "grant",
      active: true,
      plan,
      variantId,
      subjectId,
      endsAt,
      reason: "license_active",
    };
  }

  if (!SUBSCRIPTION_EVENTS.has(event)) {
    return ignore(event, "not_a_license_event", { plan, variantId, subjectId });
  }

  if (status === "expired" || status === "unpaid" || (endsAtTime !== undefined && endsAtTime <= now.getTime())) {
    return {
      event,
      action: "revoke",
      active: false,
      plan,
      variantId,
      subjectId,
      endsAt,
      reason: status === "unpaid" ? "unpaid" : "expired",
    };
  }

  return {
    event,
    action: "grant",
    active: true,
    plan,
    variantId,
    subjectId,
    endsAt,
    reason: status === "cancelled" || event === "subscription_cancelled" ? "cancelled_until_period_end" : (status ?? "active"),
  };
}

export function applyLicenseDecision(
  store: Map<string, StoredLicense>,
  decision: LemonLicenseDecision,
): void {
  if (!decision.subjectId || !decision.plan || !decision.variantId || decision.action === "ignore") return;
  const previous = store.get(decision.subjectId);
  store.set(decision.subjectId, {
    plan: decision.plan,
    variantId: decision.variantId,
    subjectId: decision.subjectId,
    active: decision.action === "grant",
    endsAt: decision.endsAt ?? (decision.action === "revoke" ? previous?.endsAt ?? null : null),
  });
}

/** Pro stays on through a cancelled period and ends once `endsAt` has passed or the license was revoked. */
export function licenseIsActive(license: StoredLicense | undefined, now: Date): boolean {
  if (!license?.active) return false;
  if (!license.endsAt) return true;
  const time = Date.parse(license.endsAt);
  return !Number.isNaN(time) && time > now.getTime();
}

