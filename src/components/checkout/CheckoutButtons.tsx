"use client";

import { PRICING } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { useLemonCheckout } from "@/hooks/useLemonCheckout";

export function CheckoutButtons({
  onContinueFree,
}: {
  onContinueFree?: () => void;
}) {
  const { mode, ready, opening, openCheckout, demoUnlock } = useLemonCheckout();

  if (!ready) {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled>Checking checkout…</Button>
        {onContinueFree ? (
          <Button variant="ghost" onClick={onContinueFree}>
            Continue free
          </Button>
        ) : null}
      </div>
    );
  }

  if (mode.fallback === "soon") {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled>Payments coming soon</Button>
        {onContinueFree ? (
          <Button variant="ghost" onClick={onContinueFree}>
            Continue free
          </Button>
        ) : null}
        <p className="mt-1 text-center text-[11px] text-muted">
          Lemon Squeezy checkout is not configured on this deployment.
        </p>
      </div>
    );
  }

  if (mode.fallback === "demo") {
    return (
      <div className="flex flex-col gap-2">
        <Button onClick={demoUnlock}>Unlock Pro — ${PRICING.oneTime} (demo)</Button>
        {onContinueFree ? (
          <Button variant="ghost" onClick={onContinueFree}>
            Continue free
          </Button>
        ) : null}
        <p className="mt-1 text-center text-[11px] text-muted">
          Demo mode — Lemon Squeezy is not configured. This local unlock is development-only.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {mode.oneTimeEnabled ? (
        <Button onClick={() => void openCheckout("onetime")} disabled={opening}>
          {opening ? "Opening checkout…" : `Unlock Pro — $${PRICING.oneTime}`}
        </Button>
      ) : null}
      {mode.monthlyEnabled ? (
        <Button
          variant={mode.oneTimeEnabled ? "secondary" : "primary"}
          onClick={() => void openCheckout("monthly")}
          disabled={opening}
        >
          Subscribe monthly
        </Button>
      ) : null}
      {onContinueFree ? (
        <Button variant="ghost" onClick={onContinueFree}>
          Continue free
        </Button>
      ) : null}
      <p className="mt-1 text-center text-[11px] text-muted">
        Secure checkout via Lemon Squeezy. Pro unlocks on this device after payment.
      </p>
    </div>
  );
}
