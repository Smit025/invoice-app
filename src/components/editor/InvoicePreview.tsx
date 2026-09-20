"use client";

import { useEffect, useRef, useState } from "react";
import { invoiceHasLiveData } from "@/lib/format";
import { sampleInvoice } from "@/lib/invoice";
import { InvoiceDocument } from "@/components/templates/InvoiceDocument";
import { useInvoice } from "@/components/editor/InvoiceStore";

const PAPER_WIDTH = 794;

export function InvoicePreview({
  paperRef,
}: {
  paperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { invoice, isPro } = useInvoice();
  const live = invoiceHasLiveData(invoice);
  const previewInvoice = live
    ? invoice
    : {
        ...sampleInvoice(invoice.templateId),
        templateId: invoice.templateId,
        locale: invoice.locale,
        currency: invoice.currency,
      };

  return (
    <div className="relative flex h-full min-h-[70vh] flex-col bg-surface lg:min-h-0">
      {!live ? (
        <p className="px-4 pt-3 text-center text-xs text-muted">
          Sample preview — add your name or a line item to see live data
        </p>
      ) : null}
      <div className="flex flex-1 justify-center overflow-auto p-4 lg:p-6">
        <ScaledPaper>
          <InvoiceDocument invoice={previewInvoice} showWatermark={!isPro} />
        </ScaledPaper>
      </div>
      <div className="absolute left-[-10000px] top-0" aria-hidden>
        <InvoiceDocument invoice={invoice} showWatermark={!isPro} paperRef={paperRef} />
      </div>
    </div>
  );
}

function ScaledPaper({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.65);
  const [height, setHeight] = useState(1123 * 0.65);

  useEffect(() => {
    const wrap = wrapRef.current;
    const paper = paperRef.current;
    if (!wrap || !paper) return;

    const apply = () => {
      const next = Math.min(1, wrap.clientWidth / PAPER_WIDTH);
      setScale(next);
      setHeight(paper.offsetHeight * next);
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    ro.observe(paper);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={wrapRef} className="w-full max-w-[640px]" style={{ height }}>
      <div
        ref={paperRef}
        className="origin-top-left shadow-[0_0_0_1px_var(--border)]"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
