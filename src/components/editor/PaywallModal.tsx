"use client";

import { PRICING } from "@/lib/constants";
import { sampleInvoice } from "@/lib/invoice";
import { Modal } from "@/components/ui/Modal";
import { InvoiceDocument } from "@/components/templates/InvoiceDocument";
import { CheckoutButtons } from "@/components/checkout/CheckoutButtons";
import { useInvoice } from "@/components/editor/InvoiceStore";

const COPY: Record<string, { title: string; body: string }> = {
  watermark: {
    title: "Remove the watermark",
    body: "Go Pro to export clean PDFs with your logo and unlimited local drafts.",
  },
  logo: {
    title: "Add your logo",
    body: "Logo upload is included with Pro, along with watermark-free PDFs.",
  },
  drafts: {
    title: "Keep invoice history",
    body: "Free includes one draft on this device. Pro unlocks unlimited local drafts.",
  },
  pdf: {
    title: "Enjoying InvoiceMaker?",
    body: `Pro removes the watermark and adds logo + draft history — $${PRICING.oneTime} once, or $${PRICING.monthly}/mo.`,
  },
  pricing: {
    title: "Upgrade to Pro",
    body: "No watermark, logo on every invoice, and unlimited drafts on this device.",
  },
};

export function PaywallModal() {
  const { paywallOpen, paywallReason, closePaywall } = useInvoice();
  const copy = COPY[paywallReason] ?? COPY.pricing;
  const sample = sampleInvoice("classic");

  return (
    <Modal open={paywallOpen} onClose={closePaywall} labelledBy="paywall-title">
      <h2 id="paywall-title" className="text-lg font-semibold leading-7">
        {copy.title}
      </h2>
      <p className="mt-1 text-sm leading-5 text-muted">{copy.body}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <p className="px-2 py-1 text-center text-[11px] text-muted">Free</p>
          <div className="h-28 overflow-hidden">
            <div style={{ transform: "scale(0.18)", transformOrigin: "top center" }}>
              <InvoiceDocument invoice={sample} showWatermark />
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <p className="px-2 py-1 text-center text-[11px] text-accent">Pro</p>
          <div className="h-28 overflow-hidden">
            <div style={{ transform: "scale(0.18)", transformOrigin: "top center" }}>
              <InvoiceDocument invoice={sample} showWatermark={false} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-surface p-3">
        <p className="text-sm font-semibold">${PRICING.oneTime} one-time</p>
        <p className="text-sm text-muted">or ${PRICING.monthly}/mo · USD</p>
      </div>

      <div className="mt-4">
        <CheckoutButtons onContinueFree={closePaywall} />
      </div>
    </Modal>
  );
}
