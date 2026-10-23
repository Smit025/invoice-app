import crypto from "node:crypto";

export const LEMON_SUBSCRIPTION_EVENTS = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_payment_refunded",
  "subscription_resumed",
  "subscription_paused",
  "subscription_unpaused",
] as const;

export const LEMON_LICENSE_EVENTS = [
  ...LEMON_SUBSCRIPTION_EVENTS,
  "order_refunded",
  "license_key_created",
  "license_key_updated",
] as const;

export type LemonLicenseEvent = (typeof LEMON_LICENSE_EVENTS)[number];

/** @deprecated Use LEMON_LICENSE_EVENTS. Orders are not a permanent Pro grant. */
export const LEMON_ENTITLEMENT_EVENTS = LEMON_LICENSE_EVENTS;

export type LemonEntitlementEvent = LemonLicenseEvent;

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

function readMeta(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const meta = (payload as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  return meta as Record<string, unknown>;
}

export function getLemonEventName(payload: unknown): string | undefined {
  const eventName = readMeta(payload)?.event_name;
  return typeof eventName === "string" ? eventName : undefined;
}

/** Lemon sets `meta.test_mode` on events from test mode. Accept those only when VERCEL_ENV is preview. */
export function isLemonTestMode(payload: unknown): boolean {
  return readMeta(payload)?.test_mode === true;
}

export function isLemonEntitlementEvent(eventName: string | undefined): eventName is LemonLicenseEvent {
  return !!eventName && (LEMON_LICENSE_EVENTS as readonly string[]).includes(eventName);
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
