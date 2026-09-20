import type { Address, Invoice, TaxBreakdown } from "@/lib/types";
import { dueStatus, formatAddressLines, formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/Controls";
import { cn } from "@/lib/cn";

export function PartyBlock({
  label,
  party,
  showPhone = false,
  hideName = false,
}: {
  label: string;
  party: Address;
  showPhone?: boolean;
  hideName?: boolean;
}) {
  const lines = formatAddressLines(party);
  return (
    <div>
      {label ? <p className="section-label mb-1">{label}</p> : null}
      {hideName ? null : (
        <p className="text-sm font-medium leading-5 text-text">{party.name || "—"}</p>
      )}
      {lines.map((line) => (
        <p key={line} className="text-sm leading-5 text-text">
          {line}
        </p>
      ))}
      {party.email ? <p className="text-sm leading-5 text-muted">{party.email}</p> : null}
      {showPhone && party.phone ? (
        <p className="text-sm leading-5 text-muted">{party.phone}</p>
      ) : null}
      {party.taxId ? (
        <p className="mt-1 text-xs leading-4 text-muted">Tax ID {party.taxId}</p>
      ) : null}
    </div>
  );
}

export function StatusBadge({ invoice }: { invoice: Invoice }) {
  const status = dueStatus(invoice);
  if (!status) return null;
  return (
    <Badge tone={status === "overdue" ? "danger" : "muted"}>
      {status === "overdue" ? "Overdue" : "Due"}
    </Badge>
  );
}

export function LineTable({
  invoice,
  totals,
  variant,
}: {
  invoice: Invoice;
  totals: TaxBreakdown;
  variant: "classic" | "minimal" | "bold";
}) {
  const showHsn = invoice.taxMode === "gst";
  const rows = totals.items.length > 0 ? totals.items : invoice.items;
        const filled = rows.filter((row) => row.description.trim() || row.rate > 0);

  return (
    <table className="w-full border-collapse text-left text-[12px] leading-4">
      <thead>
        <tr
          className={cn(
            variant === "classic" && "bg-surface-2",
            variant === "bold" && "bg-accent-subtle",
            variant === "minimal" && "border-b border-border",
          )}
        >
          <th className="px-3 py-2 font-medium text-muted">Description</th>
          {showHsn ? <th className="px-2 py-2 font-medium text-muted">HSN</th> : null}
          <th className="px-2 py-2 text-right font-medium text-muted">Qty</th>
          <th className="px-2 py-2 text-right font-medium text-muted">Rate</th>
          <th
            className={cn(
              "px-3 py-2 text-right font-medium text-muted",
              variant === "bold" && "font-semibold text-text",
            )}
          >
            Amount
          </th>
        </tr>
      </thead>
      <tbody>
        {(filled.length > 0 ? filled : [{ id: "empty", description: "—", qty: 0, rate: 0, amount: 0 }]).map(
          (row) => (
            <tr key={row.id} className="border-b border-border">
              <td className="px-3 py-2 text-text">{row.description || "—"}</td>
              {showHsn ? <td className="px-2 py-2 text-muted">{row.hsn || "—"}</td> : null}
              <td className="tabular px-2 py-2 text-right">{row.qty || "—"}</td>
              <td className="tabular px-2 py-2 text-right">
                {formatMoney(row.rate || 0, invoice.currency, invoice.locale)}
              </td>
              <td
                className={cn(
                  "tabular px-3 py-2 text-right",
                  variant === "bold" && "font-semibold",
                )}
              >
                {formatMoney(row.amount || 0, invoice.currency, invoice.locale)}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export function Totals({
  invoice,
  totals,
  variant,
}: {
  invoice: Invoice;
  totals: TaxBreakdown;
  variant: "classic" | "minimal" | "bold";
}) {
  const money = (n: number) => formatMoney(n, invoice.currency, invoice.locale);
  const rows: Array<{ label: string; value: string; strong?: boolean }> = [
    { label: "Subtotal", value: money(totals.subtotal) },
  ];

  if (invoice.taxMode === "gst" && totals.tax > 0) {
    if (totals.intraState) {
      rows.push({ label: `CGST ${(invoice.taxRate ?? 0) / 2}%`, value: money(totals.cgst) });
      rows.push({ label: `SGST ${(invoice.taxRate ?? 0) / 2}%`, value: money(totals.sgst) });
    } else {
      rows.push({ label: `IGST ${invoice.taxRate ?? 0}%`, value: money(totals.igst) });
    }
  } else if (invoice.taxMode !== "none" && (invoice.taxRate ?? 0) > 0) {
    rows.push({
      label: `${totals.taxLabel} ${invoice.taxRate}%`,
      value: money(totals.tax),
    });
  }

  rows.push({ label: "Total", value: money(totals.total), strong: true });

  return (
    <div className={cn("ml-auto w-[220px]", variant === "minimal" && "w-[200px]")}>
      {rows.map((row) => (
        <div
          key={row.label}
          className={cn(
            "flex items-baseline justify-between gap-4 py-1 text-[12px] leading-4",
            row.strong && variant === "bold" && "bg-accent-subtle px-2 py-2",
            row.strong && variant === "minimal" && "mt-1 text-[20px] font-semibold leading-7",
            row.strong && variant === "classic" && "border-t border-border pt-2 font-semibold",
          )}
        >
          <span className={row.strong ? "text-text" : "text-muted"}>{row.label}</span>
          <span className={cn("tabular", row.strong && variant === "bold" && "text-[20px] font-semibold leading-7")}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Meta({ invoice, align = "right" }: { invoice: Invoice; align?: "left" | "right" }) {
  return (
    <dl className={cn("space-y-1 text-[12px] leading-4", align === "right" && "text-right")}>
      <div>
        <dt className="section-label">Invoice</dt>
        <dd className="font-medium">{invoice.number || "—"}</dd>
      </div>
      <div>
        <dt className="text-muted">Issue date</dt>
        <dd>{formatDate(invoice.issueDate, invoice.locale)}</dd>
      </div>
      <div>
        <dt className="text-muted">Due date</dt>
        <dd>{formatDate(invoice.dueDate, invoice.locale)}</dd>
      </div>
    </dl>
  );
}

export function Logo({ src }: { src?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="Business logo" className="max-h-12 max-w-12 object-contain" />
  );
}

export function Notes({ invoice }: { invoice: Invoice }) {
  if (!invoice.notes && !invoice.paymentTerms) return null;
  return (
    <div className="max-w-[55%] space-y-2 text-[12px] leading-4">
      {invoice.notes ? (
        <div>
          <p className="section-label mb-1">Notes</p>
          <p className="whitespace-pre-wrap text-text">{invoice.notes}</p>
        </div>
      ) : null}
      {invoice.paymentTerms ? (
        <div>
          <p className="section-label mb-1">Payment terms</p>
          <p className="text-text">{invoice.paymentTerms}</p>
        </div>
      ) : null}
    </div>
  );
}
