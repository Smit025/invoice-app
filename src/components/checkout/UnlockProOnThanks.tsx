"use client";

import { useEffect } from "react";
import { unlockProLocally } from "@/lib/pro";
import { showToast } from "@/lib/toast";

export function UnlockProOnThanks() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pro") !== "1") return;
    unlockProLocally();
    showToast("Pro unlocked. Watermark and logo limits are off on this device.");
  }, []);

  return null;
}
