import { planForVariant, type CheckoutPlan } from "./lemon-config";
import type { EntitlementRecord } from "./entitlement-store";

type FetchLike = typeof fetch;

type LemonResource = {
  id?: string;
  attributes?: Record<string, unknown>;
};

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function readIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

async function lemonGet(path: string, apiKey: string, fetchImpl: FetchLike): Promise<unknown | null> {
  const response = await fetchImpl(`https://api.lemonsqueezy.com/v1/${path}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

function resource(body: unknown): LemonResource | null {
  const data = readRecord(body)?.data;
  const record = readRecord(data);
  if (!record) return null;
  return { id: asId(record.id), attributes: readRecord(record.attributes) };
}

export type RestoreVerification =
  | { ok: true; record: EntitlementRecord }
  | { ok: false; reason: string };

/**
 * Confirms a receipt with Lemon before the subscription is bound to this install id.
 * The order email must match, the store must match, the order must be paid and not
 * refunded, and the variant must be one of the two live plans. test_mode orders
 * are accepted only when `allowTestMode` is set (VERCEL_ENV=preview).
 */
export async function verifyLemonRestore(input: {
  apiKey: string;
  orderId: string;
  email: string;
  storeId: string;
  installId: string;
  variants: { sixMonth: string; monthly: string };
  allowTestMode: boolean;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<RestoreVerification> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const direct = resource(await lemonGet(`orders/${encodeURIComponent(input.orderId)}`, input.apiKey, fetchImpl));
  let order = direct;
  if (!order) {
    const listed = await lemonGet(
      `orders?filter[order_number]=${encodeURIComponent(input.orderId)}&page[size]=2`,
      input.apiKey,
      fetchImpl,
    );
    const rows = readRecord(listed)?.data;
    if (Array.isArray(rows) && rows.length === 1) order = resource({ data: rows[0] });
  }
  if (!order?.attributes || !order.id) return { ok: false, reason: "order_not_found" };

  const attributes = order.attributes;
  const email = typeof attributes.user_email === "string" ? attributes.user_email.trim().toLowerCase() : "";
  if (!email || email !== input.email.trim().toLowerCase()) return { ok: false, reason: "email_mismatch" };
  if (asId(attributes.store_id) !== input.storeId) return { ok: false, reason: "store_mismatch" };
  if (attributes.test_mode === true && !input.allowTestMode) return { ok: false, reason: "test_mode" };
  if (attributes.refunded === true || attributes.status === "refunded") return { ok: false, reason: "refunded" };
  if (attributes.status !== "paid") return { ok: false, reason: "not_paid" };

  const subscriptionId = asId(attributes.subscription_id);
  if (!subscriptionId) return { ok: false, reason: "missing_subscription" };

  const subscription = resource(
    await lemonGet(`subscriptions/${encodeURIComponent(subscriptionId)}`, input.apiKey, fetchImpl),
  );
  const sub = subscription?.attributes;
  if (!sub || !subscription?.id) return { ok: false, reason: "subscription_not_found" };
  if (asId(sub.store_id) !== input.storeId) return { ok: false, reason: "store_mismatch" };
  if (sub.test_mode === true && !input.allowTestMode) return { ok: false, reason: "test_mode" };

  const firstItem = readRecord(attributes.first_order_item);
  const variantId = asId(sub.variant_id) ?? asId(firstItem?.variant_id);
  const plan: CheckoutPlan | undefined = planForVariant(variantId, input.variants);
  if (!plan || !variantId) return { ok: false, reason: "unknown_variant" };

  const status = typeof sub.status === "string" ? sub.status : "active";
  if (status === "refunded" || sub.refunded === true) return { ok: false, reason: "refunded" };
  const endsAt = readIso(sub.ends_at);
  const renewsAt = readIso(sub.renews_at);
  const until = endsAt ?? renewsAt;
  const untilMs = until ? Date.parse(until) : Number.NaN;
  const future = !Number.isNaN(untilMs) && untilMs > now.getTime();
  const active = future && status !== "paused" && status !== "expired" && status !== "unpaid" && status !== "past_due";

  const record: EntitlementRecord = {
    subscriptionId: subscription.id,
    userId: input.installId,
    plan,
    variantId,
    status,
    active,
    endsAt,
    renewsAt: status === "cancelled" ? null : renewsAt,
    updatedAt: now.toISOString(),
    updatedAtMs: now.getTime(),
    refunded: false,
  };
  return { ok: true, record };
}
