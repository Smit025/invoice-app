"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT } from "@/lib/toast";

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hide: number | undefined;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== "string" || !detail.trim()) return;
      setMessage(detail);
      window.clearTimeout(hide);
      hide = window.setTimeout(() => setMessage(null), 4200);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(hide);
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(100%-2rem,24rem)] -translate-x-1/2 rounded-lg border border-border bg-bg px-4 py-3 text-sm text-text shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
    >
      {message}
    </div>
  );
}
