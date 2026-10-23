"use client";

import Script from "next/script";
import { CHECKOUT_CONFIRMED_EVENT } from "@/lib/entitlement-client";
import { markCheckoutStarted } from "@/lib/install-id";
import { showToast } from "@/lib/toast";

const LEMON_JS_SRC = "https://assets.lemonsqueezy.com/lemon.js";

function handleLemonEvent(event: { event: string }): void {
  if (event.event !== "Checkout.Success") return;
  markCheckoutStarted();
  showToast("Payment received. Pro appears on this device after the subscription is confirmed.");
  window.dispatchEvent(new Event(CHECKOUT_CONFIRMED_EVENT));
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
