import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { CheckoutButtons } from "@/components/checkout/CheckoutButtons";
import { PRICING } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free invoice maker with watermark, or Pro for $7.99 one-time / $2.99 per month.",
};

export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-10">
      <div className="mx-auto max-w-xl">
        <BrandMark />
        <h1 className="mt-8 text-[28px] font-semibold leading-9">Free vs Pro</h1>
        <p className="mt-2 text-sm text-muted">
          USD primary. Checkout runs through Lemon Squeezy when configured.
        </p>
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border p-5">
            <p className="font-semibold">Free — $0</p>
            <p className="mt-1 text-sm text-muted">
              Editor, PDF, 3 templates, watermark, 1 local draft, no logo.
            </p>
          </div>
          <div className="rounded-xl border border-accent p-5">
            <p className="font-semibold text-accent">
              Pro — ${PRICING.oneTime} one-time or ${PRICING.monthly}/mo
            </p>
            <p className="mt-1 text-sm text-muted">
              No watermark, logo upload, unlimited drafts on this device.
            </p>
            <div className="mt-4">
              <CheckoutButtons />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Link href="/app">
            <Button>Create invoice</Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
