"use client";

import { useCallback, useEffect, useState } from "react";
import type { CheckoutPlan } from "@/lib/lemon-config";
import { getLemonPublicConfig, resolvePaywallCheckout } from "@/lib/lemon-config";
import { unlockProLocally } from "@/lib/pro";
import { showToast } from "@/lib/toast";

type ApiCapabilities = { oneTime: boolean; monthly: boolean };

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

async function fetchApiCapabilities(): Promise<ApiCapabilities> {
  const response = await fetch("/api/checkout", { cache: "no-store" });
  if (!response.ok) return { oneTime: false, monthly: false };
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") return { oneTime: false, monthly: false };
  const record = payload as { oneTime?: unknown; monthly?: unknown };
  return {
    oneTime: Boolean(record.oneTime),
    monthly: Boolean(record.monthly),
  };
}

export function useLemonCheckout() {
  const publicConfig = getLemonPublicConfig();
  const [api, setApi] = useState<ApiCapabilities | null>(
    publicConfig.oneTimeUrl && publicConfig.monthlyUrl ? { oneTime: true, monthly: true } : null,
  );
  const [opening, setOpening] = useState(false);
  const hasPublicUrl = Boolean(publicConfig.oneTimeUrl || publicConfig.monthlyUrl);

  useEffect(() => {
    if (publicConfig.oneTimeUrl && publicConfig.monthlyUrl) return;
    let cancelled = false;
    fetchApiCapabilities()
      .then((next) => {
        if (!cancelled) setApi(next);
      })
      .catch(() => {
        if (!cancelled) setApi({ oneTime: false, monthly: false });
      });
    return () => {
      cancelled = true;
    };
  }, [publicConfig.monthlyUrl, publicConfig.oneTimeUrl]);

  const mode = resolvePaywallCheckout({
    publicOneTime: publicConfig.oneTimeUrl,
    publicMonthly: publicConfig.monthlyUrl,
    apiOneTime: api?.oneTime,
    apiMonthly: api?.monthly,
    nodeEnv: process.env.NODE_ENV,
  });

  const ready = api !== null || hasPublicUrl;

  const openCheckout = useCallback(
    async (plan: CheckoutPlan) => {
      setOpening(true);
      try {
        const publicUrl =
          plan === "monthly" ? publicConfig.monthlyUrl : publicConfig.oneTimeUrl;
        if (publicUrl) {
          await openLemonOverlay(publicUrl);
          return;
        }

        const response = await fetch("/api/checkout", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const payload: unknown = await response.json().catch(() => null);
        const url =
          payload && typeof payload === "object" && typeof (payload as { url?: unknown }).url === "string"
            ? (payload as { url: string }).url
            : undefined;
        if (!response.ok || !url) {
          showToast("Checkout is unavailable right now. Try again in a moment.");
          return;
        }
        await openLemonOverlay(url);
      } catch {
        showToast("Could not open checkout. Check your connection and try again.");
      } finally {
        setOpening(false);
      }
    },
    [publicConfig.monthlyUrl, publicConfig.oneTimeUrl, setOpening],
  );

  const demoUnlock = useCallback(() => {
    unlockProLocally();
    showToast("Pro unlocked (demo). Lemon Squeezy is not configured.");
  }, []);

  return { mode, ready, opening, openCheckout, demoUnlock };
}
