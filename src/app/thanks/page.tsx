import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
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
        When Lemon Squeezy checkout is connected, successful payments will land here. For the
        MVP stub, unlock Pro from the editor paywall (demo) or set localStorage{" "}
        <code className="font-mono text-text">invoice-pro-v1</code> to <code className="font-mono text-text">1</code>.
      </p>
      <Link href="/app" className="mt-6">
        <Button>Back to editor</Button>
      </Link>
    </div>
  );
}
