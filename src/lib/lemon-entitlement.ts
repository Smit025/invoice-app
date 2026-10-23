import type { CheckoutPlan } from "./lemon-config";
import type { EntitlementRecord, EntitlementStore } from "./entitlement-store";
import {
  payloadPriceMatches,
  resolveLemonLicense,
  type DateMode,
  type LemonLicenseDecision,
  type ResolveLicenseOptions,
} from "./lemon-license";

export type PersistResult = {
  result: "applied" | "duplicate" | "stale" | "ignored";
  action: LemonLicenseDecision["action"] | "duplicate" | "stale";
  variantId: string | null;
  reason: string;
};

function mergeDate(mode: DateMode, incoming: string | null, existing: string | null | undefined): string | null {
  if (mode === "keep") return existing ?? null;
  if (mode === "set") return incoming;
  return incoming ?? existing ?? null;
}

function accessIsFuture(endsAt: string | null, renewsAt: string | null, now: Date): boolean {
  const until = endsAt ?? renewsAt;
  if (!until) return false;
  const time = Date.parse(until);
  return !Number.isNaN(time) && time > now.getTime();
}

async function finish(
  store: EntitlementStore,
  eventId: string | null,
  result: PersistResult,
): Promise<PersistResult> {
  if (eventId && result.result !== "duplicate") {
    await store.markEvent(eventId);
  }
  return result;
}

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

  if (decision.eventId && (await store.hasEvent(decision.eventId))) {
    return { result: "duplicate", action: "duplicate", variantId: decision.variantId, reason: "duplicate_event" };
  }

  let existing = decision.subjectId ? await store.getBySubscriptionId(decision.subjectId) : null;
  if (!existing && decision.userId && decision.action === "revoke") {
    existing = await store.getByUserId(decision.userId);
  }

  if (existing && decision.eventTime) {
    const eventMs = Date.parse(decision.eventTime);
    if (!Number.isNaN(eventMs) && eventMs < existing.updatedAtMs) {
      return finish(store, decision.eventId, {
        result: "stale",
        action: "stale",
        variantId: decision.variantId ?? existing.variantId,
        reason: "stale_event",
      });
    }
  }

  if (existing && decision.userId && existing.userId !== decision.userId) {
    return finish(store, decision.eventId, {
      result: "ignored",
      action: "ignore",
      variantId: decision.variantId,
      reason: "user_mismatch",
    });
  }

  const userId = decision.userId ?? existing?.userId ?? null;
  const subscriptionId = decision.subjectId ?? existing?.subscriptionId ?? null;
  if (!userId || !subscriptionId) {
    return finish(store, decision.eventId, {
      result: "ignored",
      action: "ignore",
      variantId: decision.variantId,
      reason: userId ? "missing_subscription" : "missing_user",
    });
  }

  let plan: CheckoutPlan | null = decision.plan;
  let variantId: string | null = decision.variantId;
  if (!plan || !variantId) {
    if (!existing || decision.action === "grant") {
      return finish(store, decision.eventId, {
        result: "ignored",
        action: "ignore",
        variantId,
        reason: "unknown_variant",
      });
    }
    if (!payloadPriceMatches(payload, existing.plan)) {
      return finish(store, decision.eventId, {
        result: "ignored",
        action: "ignore",
        variantId: existing.variantId,
        reason: "price_mismatch",
      });
    }
    plan = existing.plan;
    variantId = existing.variantId;
  }
  if (!plan || !variantId) {
    return finish(store, decision.eventId, {
      result: "ignored",
      action: "ignore",
      variantId,
      reason: "unknown_variant",
    });
  }

  let endsAt = decision.endsAt;
  let renewsAt = decision.renewsAt;
  let active = false;

  if (decision.action === "no_extend") {
    // Grace is the period already paid for. A failure or past_due status must not move it later.
    endsAt = existing?.endsAt ?? null;
    renewsAt = existing?.renewsAt ?? null;
    active = Boolean(existing?.active) && accessIsFuture(endsAt, renewsAt, now);
  } else if (decision.action === "pause") {
    endsAt = existing?.endsAt ?? null;
    renewsAt = existing?.renewsAt ?? null;
    active = false;
  } else if (decision.action === "revoke") {
    endsAt = mergeDate(decision.dateMode, decision.endsAt, existing?.endsAt);
    renewsAt = mergeDate(decision.dateMode, decision.renewsAt, existing?.renewsAt);
    active = false;
  } else {
    endsAt = mergeDate(decision.dateMode, decision.endsAt, existing?.endsAt);
    renewsAt = mergeDate(decision.dateMode, decision.renewsAt, existing?.renewsAt);
    active = accessIsFuture(endsAt, renewsAt, now);
  }

  const eventMs = decision.eventTime ? Date.parse(decision.eventTime) : Number.NaN;
  const record: EntitlementRecord = {
    subscriptionId,
    userId,
    plan,
    variantId,
    status: decision.status ?? decision.reason,
    active,
    endsAt,
    renewsAt,
    updatedAt: decision.eventTime ?? now.toISOString(),
    updatedAtMs: Number.isNaN(eventMs) ? now.getTime() : eventMs,
  };
  await store.save(record);
  return finish(store, decision.eventId, {
    result: "applied",
    action: decision.action,
    variantId,
    reason: decision.reason,
  });
}
