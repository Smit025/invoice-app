"use client";

import { GST_RATES } from "@/lib/constants";
import { gstPlaceOfSupply, parseNonNegativeInput } from "@/lib/tax";
import type { Invoice, TaxMode } from "@/lib/types";
import { Chip, SegmentedControl } from "@/components/ui/Controls";
import { Field, Input } from "@/components/ui/Field";

const TAX_OPTIONS: Array<{ value: TaxMode; label: string }> = [
  { value: "none", label: "None" },
  { value: "sales_tax", label: "Sales tax" },
  { value: "vat", label: "VAT" },
  { value: "gst", label: "GST" },
];

export function TaxSection({
  invoice,
  onChange,
}: {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
}) {
  const place = invoice.taxMode === "gst" ? gstPlaceOfSupply(invoice) : null;

  return (
    <div className="space-y-3">
      <SegmentedControl
        ariaLabel="Tax mode"
        value={invoice.taxMode}
        onChange={(taxMode) =>
          onChange({
            ...invoice,
            taxMode,
            taxRate: taxMode === "none" ? 0 : invoice.taxRate || (taxMode === "vat" ? 20 : 0),
          })
        }
        options={TAX_OPTIONS}
      />

      {invoice.taxMode !== "none" ? (
        <Field
          label={invoice.taxMode === "vat" ? "VAT rate" : invoice.taxMode === "gst" ? "GST rate" : "Sales tax rate"}
          htmlFor="tax-rate"
        >
          <div className="relative">
            <Input
              id="tax-rate"
              type="number"
              min={0}
              max={100}
              step="0.001"
              inputMode="decimal"
              value={invoice.taxRate ?? 0}
              onChange={(e) =>
                onChange({ ...invoice, taxRate: Math.min(100, parseNonNegativeInput(e.target.value, 100)) })
              }
              onBlur={(e) =>
                onChange({ ...invoice, taxRate: Math.min(100, parseNonNegativeInput(e.target.value, 100)) })
              }
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (text.trim() !== "" && (Number(text) < 0 || !Number.isFinite(Number(text)))) {
                  e.preventDefault();
                  onChange({ ...invoice, taxRate: 0 });
                }
              }}
              className="pr-8 tabular"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              %
            </span>
          </div>
        </Field>
      ) : null}

      {invoice.taxMode === "gst" ? (
        <div className="space-y-2">
          <p className="text-xs leading-4 text-muted">Common GST rates</p>
          <div className="flex flex-wrap gap-2">
            {GST_RATES.map((rate) => (
              <Chip
                key={rate}
                selected={(invoice.taxRate ?? 0) === rate}
                onClick={() => onChange({ ...invoice, taxRate: rate })}
              >
                {rate}%
              </Chip>
            ))}
          </div>
          {place === "incomplete" ? (
            <p role="alert" className="text-xs leading-4 text-danger">
              Set country to India and pick a state on both From and To. GST is not calculated — and
              PDF export is blocked — until both are set.
            </p>
          ) : (
            <p className="text-xs leading-4 text-muted">
              {place === "intra"
                ? "Same state: CGST + SGST will split the rate."
                : "Different states: IGST applies on the full rate."}
            </p>
          )}
        </div>
      ) : null}

      {invoice.taxMode === "vat" ? (
        <p className="text-xs leading-4 text-muted">
          Exclusive VAT. Add a VAT number on From (and To if needed).
        </p>
      ) : null}

      {invoice.taxMode !== "none" ? (
        <p className="text-xs leading-4 text-muted">
          Rates are entered by you. This is not tax advice.
        </p>
      ) : null}
    </div>
  );
}
