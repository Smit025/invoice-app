"use client";

import { useEffect } from "react";
import { CHECKOUT_CONFIRMED_EVENT, fetchEntitlement, publishEntitlement } from "@/lib/entitlement-client";
import { getOrCreateInstallId } from "@/lib/install-id";

export function EntitlementPoller() {
  useEffect(() => {
    const userId = getOrCreateInstallId();
    let stopped = false;

    const tick = async () => {
      try {
        const snapshot = await fetchEntitlement(userId);
        if (stopped || !snapshot) return;
        publishEntitlement(snapshot);
      } catch {
        /* offline; the next poll retries */
      }
    };

    void tick();
    const interval = window.setInterval(() => void tick(), 5000);
    const onWake = () => void tick();
    window.addEventListener("focus", onWake);
    window.addEventListener(CHECKOUT_CONFIRMED_EVENT, onWake);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onWake);
      window.removeEventListener(CHECKOUT_CONFIRMED_EVENT, onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  return null;
}
