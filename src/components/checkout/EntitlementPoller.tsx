"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  CHECKOUT_CONFIRMED_EVENT,
  FAST_POLL_MS,
  FAST_POLL_WINDOW_MS,
  fetchEntitlement,
  publishEntitlement,
  shouldQueryEntitlement,
} from "@/lib/entitlement-client";
import { getOrCreateInstallId, hasCheckoutStarted, markCheckoutStarted } from "@/lib/install-id";

export function EntitlementPoller() {
  const pathname = usePathname();

  useEffect(() => {
    const userId = getOrCreateInstallId();
    let stopped = false;
    let fastUntil = 0;
    let timer = 0;

    const fast = () => Date.now() < fastUntil;

    const tick = async (fresh: boolean) => {
      if (!shouldQueryEntitlement({ fresh, fast: fast() })) return;
      try {
        const snapshot = await fetchEntitlement(userId, { fresh });
        if (stopped || !snapshot) return;
        publishEntitlement(snapshot);
        if (snapshot.status === "active") {
          fastUntil = 0;
          window.clearInterval(timer);
        }
      } catch {
        /* A failed read must not grant Pro. */
      }
    };

    const startFast = () => {
      markCheckoutStarted();
      fastUntil = Date.now() + FAST_POLL_WINDOW_MS;
      void tick(true);
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (stopped || !fast()) {
          window.clearInterval(timer);
          return;
        }
        void tick(true);
      }, FAST_POLL_MS);
    };

    const onFocus = () => {
      if (fast()) {
        void tick(true);
        return;
      }
      void tick(false);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };

    if (pathname === "/thanks" && hasCheckoutStarted()) startFast();
    else void tick(false);

    const onConfirmed = () => startFast();
    window.addEventListener("focus", onFocus);
    window.addEventListener(CHECKOUT_CONFIRMED_EVENT, onConfirmed);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CHECKOUT_CONFIRMED_EVENT, onConfirmed);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
