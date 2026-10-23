"use client";

import { useCallback, useState } from "react";
import { rememberCheckoutPlan } from "@/lib/checkout-intent";
import {
  getLemonPublicConfig,
  getPublicCheckoutUrl,
  isDirectBuyUrl,
  resolvePaywallCheckout,
  type CheckoutPlan,
} from "@/lib/lemon-config";
import { unlockProLocally } from "@/lib/pro";
import { showToast } from "@/lib/toast";

function getLemonOpen(): ((url: string) => void) | undefined {
  if (typeof window === "undefined") return undefined;
  window.createLemonSqueezy?.();
  const lemon = window.LemonSqueezy;
  if (!lemon) return undefined;
  if (typeof lemon.Url?.Open === "function") {
    return (url: string) => lemon.Url.Open(url);
  }
  return undefined;
}

async function openLemonOverlay(url: string): Promise<void> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const open = getLemonOpen();
    if (open) {
      open(url);
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function useLemonCheckout() {
  const publicConfig = getLemonPublicConfig();
  const [opening, setOpening] = useState(false);

  const mode = resolvePaywallCheckout({
    publicSixMonth: publicConfig.sixMonthUrl,
    publicMonthly: publicConfig.monthlyUrl,
    nodeEnv: process.env.NODE_ENV,
  });

  const openCheckout = useCallback(async (plan: CheckoutPlan) => {
    setOpening(true);
    try {
      const url = isDirectBuyUrl(getPublicCheckoutUrl(plan));
      if (!url) {
        showToast("Checkout is unavailable right now. Try again in a moment.");
        return;
      }
      rememberCheckoutPlan(plan);
      await openLemonOverlay(url);
    } catch {
      showToast("Could not open checkout. Check your connection and try again.");
    } finally {
      setOpening(false);
    }
  }, [setOpening]);

  const demoUnlock = useCallback(() => {
    unlockProLocally();
    showToast("Pro unlocked (demo). Lemon Squeezy is not configured.");
  }, []);

  return { mode, ready: true, opening, openCheckout, demoUnlock };
}
