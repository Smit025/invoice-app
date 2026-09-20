"use client";

import { TEMPLATES } from "@/lib/constants";
import { sampleInvoice } from "@/lib/invoice";
import type { TemplateId } from "@/lib/types";
import { Sheet } from "@/components/ui/Modal";
import { InvoiceDocument } from "@/components/templates/InvoiceDocument";
import { useInvoice } from "@/components/editor/InvoiceStore";
import { cn } from "@/lib/cn";

export function TemplatePicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { invoice, setInvoice, isPro } = useInvoice();

  const select = (id: TemplateId) => {
    setInvoice({ ...invoice, templateId: id });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Templates">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TEMPLATES.map((template) => {
          const selected = invoice.templateId === template.id;
          return (
            <button
              key={template.id}
              type="button"
              onClick={() => select(template.id)}
              className={cn(
                "overflow-hidden rounded-lg border text-left transition-colors duration-150",
                selected ? "border-accent bg-accent-subtle" : "border-border hover:border-border-strong",
              )}
            >
              <div className="h-40 overflow-hidden bg-[#ffffff]">
                <div style={{ transform: "scale(0.22)", transformOrigin: "top center" }}>
                  <InvoiceDocument
                    invoice={sampleInvoice(template.id)}
                    showWatermark={!isPro}
                  />
                </div>
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold">{template.name}</p>
                <p className="text-xs leading-4 text-muted">{template.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
