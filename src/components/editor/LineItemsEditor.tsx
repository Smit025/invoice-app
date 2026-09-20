"use client";

import { computeTotals, lineAmount } from "@/lib/tax";
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
      <div className="hidden grid-cols-[1fr_72px_96px_96px_40px] gap-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted sm:grid">
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
        <span className="sr-only">Remove</span>
      </div>
      {invoice.items.map((item, index) => (
        <div
          key={item.id}
          className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_72px_96px_96px_40px] sm:border-0 sm:p-0"
        >
          <label className="col-span-2 sm:col-span-1">
            <span className="sr-only">Line {index + 1} description</span>
            <Input
              value={item.description}
              onChange={(e) => updateItem(item.id, { description: e.target.value })}
              placeholder="Item or service"
            />
          </label>
          {showHsn ? (
            <label className="col-span-2 sm:col-span-1 sm:hidden">
              <span className="mb-1 block text-xs text-muted">HSN</span>
              <Input
                value={item.hsn ?? ""}
                onChange={(e) => updateItem(item.id, { hsn: e.target.value })}
                placeholder="HSN (optional)"
              />
            </label>
          ) : null}
          <label>
            <span className="sr-only">Quantity</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={item.qty}
              onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
              className="tabular text-right"
            />
          </label>
          <label>
            <span className="sr-only">Rate</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={item.rate}
              onChange={(e) => updateItem(item.id, { rate: Number(e.target.value) })}
              className="tabular text-right"
            />
          </label>
          <p className="tabular flex h-10 items-center justify-end text-sm">
            {formatMoney(
              totals.items.find((row) => row.id === item.id)?.amount ?? 0,
              invoice.currency,
              invoice.locale,
            )}
          </p>
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-danger"
            aria-label={`Remove line ${index + 1}`}
          >
            ×
          </button>
          {showHsn ? (
            <label className="col-span-2 hidden sm:block">
              <span className="sr-only">HSN</span>
              <Input
                value={item.hsn ?? ""}
                onChange={(e) => updateItem(item.id, { hsn: e.target.value })}
                placeholder="HSN (optional)"
              />
            </label>
          ) : null}
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
