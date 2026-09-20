import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <h1 className="text-[28px] font-semibold leading-9">Page not found</h1>
      <p className="mt-2 text-sm text-muted">That route doesn&apos;t exist in InvoiceMaker.</p>
      <Link href="/" className="mt-6">
        <Button>Go home</Button>
      </Link>
    </div>
  );
}
