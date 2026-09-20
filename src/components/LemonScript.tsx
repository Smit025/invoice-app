"use client";

import Script from "next/script";
import { unlockProLocally } from "@/lib/pro";
import { showToast } from "@/lib/toast";

const LEMON_JS_SRC = "https://assets.lemonsqueezy.com/lemon.js";

function handleLemonEvent(event: { event: string }): void {
  if (event.event !== "Checkout.Success") return;
  unlockProLocally();
  showToast("Pro unlocked. Watermark and logo limits are off on this device.");
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
