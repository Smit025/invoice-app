"use client";

import { useEffect } from "react";
import { parseCheckoutPlanParam, readCheckoutPlan } from "@/lib/checkout-intent";
import { unlockProForPlan } from "@/lib/pro";
import { showToast } from "@/lib/toast";

export function UnlockProOnThanks() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pro") !== "1") return;
    const plan = parseCheckoutPlanParam(params.get("plan")) ?? readCheckoutPlan() ?? "monthly";
    unlockProForPlan(plan);
    showToast("Pro unlocked for this subscription period on this device.");
  }, []);

  return null;
}
