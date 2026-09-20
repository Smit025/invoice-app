"use client";

import { computeTotals, lineAmount, parseNonNegativeInput } from "@/lib/tax";
import { formatMoney } from "@/lib/format";
import { emptyItem } from "@/lib/invoice";
import type { Invoice } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

export function LineItemsEditor({
  invoice,
  onChange,
}: {
  invoice: Invoice;
  onChange: (invoice: Invoice) => void;
}) {
  const totals = computeTotals(invoice);
  const showHsn = invoice.taxMode === "gst";

  const updateItem = (id: string, patch: Partial<Invoice["items"][number]>) => {
    onChange({
      ...invoice,
      items: invoice.items.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        next.amount = lineAmount(next.qty, next.rate);
        return next;
      }),
    });
  };

  const removeItem = (id: string) => {
    const items = invoice.items.filter((item) => item.id !== id);
    onChange({ ...invoice, items: items.length > 0 ? items : [emptyItem()] });
  };

  return (
    <div className="space-y-3">
      {invoice.items.map((item, index) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-border p-3">
          <label>
            <span className="sr-only">Line {index + 1} description</span>
            <Input
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value })}
              placeholder="Item or service"
            />
          </label>
          {showHsn ? (
            <label>
              <span className="sr-only">HSN</span>
              <Input
                value={item.hsn ?? ""}
                onChange={(e) => updateItem(item.id, { hsn: e.target.value })}
                placeholder="HSN (optional)"
              />
            </label>
          ) : null}
          <div className="grid grid-cols-[1fr_1fr_1fr_40px] items-end gap-2">
            <label>
              <span className="mb-1 block text-[11px] text-muted">Qty</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={item.qty}
                onChange={(e) => updateItem(item.id, { qty: parseNonNegativeInput(e.target.value) })}
                className="tabular text-right"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] text-muted">Rate</span>
              <Input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={item.rate}
                onChange={(e) => updateItem(item.id, { rate: parseNonNegativeInput(e.target.value) })}
                className="tabular text-right"
              />
            </label>
            <p className="tabular pb-2 text-right text-sm">
              <span className="mb-1 block text-[11px] text-muted">Amount</span>
              {formatMoney(
                totals.items.find((row) => row.id === item.id)?.amount ?? 0,
                invoice.currency,
                invoice.locale,
              )}
            </p>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-danger"
              aria-label={`Remove line ${index + 1}`}
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() => onChange({ ...invoice, items: [...invoice.items, emptyItem()] })}
      >
        Add item
      </Button>
    </div>
  );
}
