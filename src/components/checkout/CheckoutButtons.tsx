"use client";

import { proPlanButtonLabel, RENEWAL_TERMS } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { useLemonCheckout } from "@/hooks/useLemonCheckout";

export function CheckoutButtons({
  onContinueFree,
  showTerms = true,
}: {
  onContinueFree?: () => void;
  showTerms?: boolean;
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
        <Button onClick={demoUnlock}>Unlock Pro (demo)</Button>
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
      <div className="grid grid-cols-2 gap-2">
        {mode.monthlyEnabled ? (
          <Button
            className="!h-auto min-h-10 whitespace-normal px-2 py-2 text-center leading-5"
            onClick={() => void openCheckout("monthly")}
            disabled={opening}
          >
            {opening ? "Opening checkout…" : proPlanButtonLabel("monthly")}
          </Button>
        ) : null}
        {mode.sixMonthEnabled ? (
          <Button
            variant={mode.monthlyEnabled ? "secondary" : "primary"}
            className="!h-auto min-h-10 whitespace-normal px-2 py-2 text-center leading-5"
            onClick={() => void openCheckout("sixMonth")}
            disabled={opening}
          >
            {opening ? "Opening checkout…" : proPlanButtonLabel("sixMonth")}
          </Button>
        ) : null}
      </div>
      {onContinueFree ? (
        <Button variant="ghost" onClick={onContinueFree}>
          Continue free
        </Button>
      ) : null}
      {showTerms ? (
        <p className="mt-1 text-center text-sm leading-5 text-muted">{RENEWAL_TERMS}</p>
      ) : null}
      <p className="text-center text-[11px] text-muted">Secure checkout via Lemon Squeezy.</p>
    </div>
  );
}
