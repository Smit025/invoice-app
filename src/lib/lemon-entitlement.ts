import type { EntitlementStore } from "./entitlement-store";
import { hashEmail } from "./email-hash";
import {
  readOrderBinding,
  readPriceEvidence,
  resolveLemonLicense,
  type LemonLicenseDecision,
  type ResolveLicenseOptions,
} from "./lemon-license";
import type { PersistResult, WebhookSpec } from "./webhook-apply";

export type { PersistResult } from "./webhook-apply";

export async function persistLemonWebhook(
  payload: unknown,
  store: EntitlementStore,
  options?: ResolveLicenseOptions,
): Promise<PersistResult> {
  const now = options?.now ?? new Date();
  const decision = resolveLemonLicense(payload, { ...options, now });
  if (decision.action === "ignore") {
    return { result: "ignored", action: "ignore", variantId: decision.variantId, reason: decision.reason };
  }
  return store.applyWebhook(toSpec(payload, decision, now));
}

function toSpec(payload: unknown, decision: LemonLicenseDecision, now: Date): WebhookSpec {
  if (decision.action === "ignore") throw new Error("ignored events are not applied");
  const evidence = readPriceEvidence(payload);
  const binding = readOrderBinding(payload);
  const eventMs = decision.eventTime ? Date.parse(decision.eventTime) : Number.NaN;
  return {
    eventId: decision.eventId,
    action: decision.action,
    dateMode: decision.dateMode,
    plan: decision.plan,
    variantId: decision.variantId,
    subjectId: decision.subjectId,
    userId: decision.userId,
    endsAt: decision.endsAt,
    renewsAt: decision.renewsAt,
    updatedAtMs: Number.isNaN(eventMs) ? now.getTime() : eventMs,
    nowMs: now.getTime(),
    nowIso: now.toISOString(),
    status: decision.status,
    reason: decision.reason,
    refund: decision.reason === "refunded",
    currency: evidence.currency,
    amounts: evidence.amounts,
    reuseStoredPlan: decision.reason === "payment_success" || decision.action !== "grant",
    orderId: binding.orderId,
    emailHash: binding.email ? hashEmail(binding.email) : null,
    eventTime: decision.eventTime,
  };
}
