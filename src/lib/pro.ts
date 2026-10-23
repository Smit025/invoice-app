import type { CheckoutPlan } from "./lemon-config";
import { addBillingPeriod } from "./pro-access";
import { writeIsPro, writeProAccess } from "./storage";

export const PRO_UNLOCKED_EVENT = "invoice-pro-unlocked";

export function unlockProLocally(): void {
  writeIsPro(true);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRO_UNLOCKED_EVENT));
}

/** Device Pro lasts until the subscription period ends, then `readIsPro` turns it off. */
export function unlockProForPlan(plan: CheckoutPlan, now = new Date(), endsAt?: string): void {
  const explicit =
    endsAt && !Number.isNaN(Date.parse(endsAt)) && Date.parse(endsAt) > now.getTime() ? endsAt : undefined;
  writeProAccess({ plan, expiresAt: explicit ?? addBillingPeriod(now, plan) });
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRO_UNLOCKED_EVENT));
}
