"use client";

import Script from "next/script";
import { readCheckoutPlan } from "@/lib/checkout-intent";
import { readCheckoutSuccess } from "@/lib/lemon-checkout-success";
import { planForVariant } from "@/lib/lemon-config";
import { unlockProForPlan } from "@/lib/pro";
import { showToast } from "@/lib/toast";

const LEMON_JS_SRC = "https://assets.lemonsqueezy.com/lemon.js";

function handleLemonEvent(event: { event: string; data?: unknown }): void {
  if (event.event !== "Checkout.Success") return;
  const details = readCheckoutSuccess(event.data);
  const plan = planForVariant(details.variantId) ?? readCheckoutPlan() ?? "monthly";
  const until = [details.endsAt, details.renewsAt].find(
    (value) => !!value && !Number.isNaN(Date.parse(value)) && Date.parse(value) > Date.now(),
  );
  unlockProForPlan(plan, new Date(), until);
  showToast("Pro unlocked for this subscription period on this device.");
}

export function setupLemonJs(): void {
  if (typeof window === "undefined") return;
  window.createLemonSqueezy?.();
  window.LemonSqueezy?.Setup({ eventHandler: handleLemonEvent });
}

export function LemonScript() {
  return (
    <Script
      src={LEMON_JS_SRC}
      strategy="afterInteractive"
      onLoad={setupLemonJs}
    />
  );
}
