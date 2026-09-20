import { Suspense } from "react";
import { EditorApp } from "@/components/editor/EditorApp";
import { InvoiceProvider } from "@/components/editor/InvoiceStore";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invoice editor",
  description: "Create and download a professional invoice PDF in your browser.",
  robots: { index: false, follow: false },
};

export default function EditorPage() {
  return (
    <InvoiceProvider>
      <Suspense fallback={<div className="p-6 text-sm text-muted">Loading editor…</div>}>
        <EditorApp />
      </Suspense>
    </InvoiceProvider>
  );
}
