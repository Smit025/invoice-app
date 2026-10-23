import type { CheckoutPlan } from "./lemon-config";

export type StoredProAccess = {
  v: 1;
  active: true;
  plan: CheckoutPlan;
  expiresAt: string;
};

export function addBillingPeriod(from: Date, plan: CheckoutPlan): string {
  const end = new Date(from.getTime());
  end.setUTCMonth(end.getUTCMonth() + (plan === "monthly" ? 1 : 6));
  return end.toISOString();
}

export function serializeProAccess(record: { plan: CheckoutPlan; expiresAt: string }): string {
  const payload: StoredProAccess = {
    v: 1,
    active: true,
    plan: record.plan,
    expiresAt: record.expiresAt,
  };
  return JSON.stringify(payload);
}

/** `"1"` is the dev/demo flag. Subscription unlocks are JSON and end at `expiresAt`. */
export function isStoredProActive(raw: string | null, now = new Date()): boolean {
  if (!raw) return false;
  if (raw === "1") return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;
    const record = parsed as { active?: unknown; expiresAt?: unknown };
    if (record.active === false) return false;
    if (typeof record.expiresAt !== "string") return record.active === true;
    const time = Date.parse(record.expiresAt);
    if (Number.isNaN(time)) return false;
    return time > now.getTime();
  } catch {
    return false;
  }
}
