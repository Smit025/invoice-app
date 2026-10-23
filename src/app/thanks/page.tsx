import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { ThanksStatus } from "@/components/checkout/ThanksStatus";
import { Button } from "@/components/ui/Button";
import { PRICE_LABEL, RENEWAL_TERMS } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thanks",
  description: "Thanks for upgrading to InvoiceMaker Pro.",
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <BrandMark />
      <h1 className="mt-8 text-[28px] font-semibold leading-9">You&apos;re all set</h1>
      <p className="mt-2 max-w-md text-sm leading-5 text-muted">
        Thanks for subscribing. {PRICE_LABEL.monthly} renews monthly. {PRICE_LABEL.sixMonth} renews
        every six months. {RENEWAL_TERMS}
      </p>
      <ThanksStatus />
      <Link href="/app" className="mt-6">
        <Button>Back to editor</Button>
      </Link>
    </div>
  );
}
