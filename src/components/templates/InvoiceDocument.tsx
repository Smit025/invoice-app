"use client";

import type { Ref } from "react";
import { computeTotals } from "@/lib/tax";
import type { Invoice } from "@/lib/types";
import { BoldTemplate } from "./BoldTemplate";
import { ClassicTemplate } from "./ClassicTemplate";
import { MinimalTemplate } from "./MinimalTemplate";
import { Watermark } from "./Watermark";

export function InvoiceDocument({
  invoice,
  showWatermark,
  paperRef,
}: {
  invoice: Invoice;
  showWatermark: boolean;
  paperRef?: Ref<HTMLDivElement>;
}) {
  const totals = computeTotals(invoice);
  const logoSrc = showWatermark ? undefined : invoice.logoDataUrl;
  const template =
    invoice.templateId === "minimal" ? (
      <MinimalTemplate invoice={invoice} totals={totals} logoSrc={logoSrc} />
    ) : invoice.templateId === "bold" ? (
      <BoldTemplate invoice={invoice} totals={totals} logoSrc={logoSrc} />
    ) : (
      <ClassicTemplate invoice={invoice} totals={totals} logoSrc={logoSrc} />
    );

  return (
    <div ref={paperRef} className="invoice-paper font-sans">
      {showWatermark ? <Watermark /> : null}
      {template}
    </div>
  );
}
