import type { CheckoutPlan } from "./lemon-config";

const CHECKOUT_PLAN_KEY = "invoice-checkout-plan";

export function rememberCheckoutPlan(plan: CheckoutPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CHECKOUT_PLAN_KEY, plan);
  } catch {
    /* session storage can be blocked; Checkout.Success still falls back */
  }
}

export function readCheckoutPlan(): CheckoutPlan | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(CHECKOUT_PLAN_KEY);
    return value === "monthly" || value === "sixMonth" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function parseCheckoutPlanParam(value: string | null): CheckoutPlan | undefined {
  return value === "monthly" || value === "sixMonth" ? value : undefined;
}
