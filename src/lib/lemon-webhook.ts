import crypto from "node:crypto";

/** Existing order / license events. Still logged; subscription billing does not replace them. */
export const LEMON_ORDER_EVENTS = ["order_created", "license_key_created"] as const;

/**
 * Subscription lifecycle events for the $4.99/mo and $39/yr plans.
 * Logged only — this app has no user store, so these do not grant or revoke Pro.
 */
export const LEMON_SUBSCRIPTION_EVENTS = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_payment_success",
] as const;

export const LEMON_ENTITLEMENT_EVENTS = [
  ...LEMON_ORDER_EVENTS,
  ...LEMON_SUBSCRIPTION_EVENTS,
] as const;

export type LemonEntitlementEvent = (typeof LEMON_ENTITLEMENT_EVENTS)[number];

export function verifyLemonSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;

  const digestHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  let digest: Buffer;
  let signature: Buffer;
  try {
    digest = Buffer.from(digestHex, "hex");
    signature = Buffer.from(signatureHeader, "hex");
  } catch {
    return false;
  }

  if (digest.length === 0 || signature.length === 0 || digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(digest, signature);
}

export function getLemonEventName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return undefined;
  const eventName = (meta as { event_name?: unknown }).event_name;
  return typeof eventName === "string" ? eventName : undefined;
}

export function isLemonEntitlementEvent(
  eventName: string | undefined,
): eventName is LemonEntitlementEvent {
  if (!eventName) return false;
  return (LEMON_ENTITLEMENT_EVENTS as readonly string[]).includes(eventName);
}

export function summarizeLemonWebhook(payload: unknown): {
  event: string | undefined;
  id: string | undefined;
  type: string | undefined;
} {
  const event = getLemonEventName(payload);
  if (!payload || typeof payload !== "object") {
    return { event, id: undefined, type: undefined };
  }
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return { event, id: undefined, type: undefined };
  }
  const record = data as { id?: unknown; type?: unknown };
  return {
    event,
    id: typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : undefined,
    type: typeof record.type === "string" ? record.type : undefined,
  };
}
