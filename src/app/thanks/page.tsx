import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { UnlockProOnThanks } from "@/components/checkout/UnlockProOnThanks";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thanks",
  description: "Thanks for upgrading to InvoiceMaker Pro.",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <UnlockProOnThanks />
      <BrandMark />
      <h1 className="mt-8 text-[28px] font-semibold leading-9">You&apos;re all set</h1>
      <p className="mt-2 max-w-md text-sm leading-5 text-muted">
        If you just completed checkout, Pro is unlocked on this device. Overlay payments unlock
        immediately via Lemon.js; hosted checkout lands here with{" "}
        <code className="font-mono text-text">?pro=1</code>.
      </p>
      <Link href="/app" className="mt-6">
        <Button>Back to editor</Button>
      </Link>
    </div>
  );
}
