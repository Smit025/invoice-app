import type { Invoice, TaxBreakdown } from "@/lib/types";
import { LineTable, Logo, Meta, Notes, PartyBlock, StatusBadge, Totals } from "./shared";

export function ClassicTemplate({
  invoice,
  totals,
  logoSrc,
}: {
  invoice: Invoice;
  totals: TaxBreakdown;
  logoSrc?: string;
}) {
  return (
    <div className="flex min-h-[1123px] flex-col">
      <div className="h-1 w-full bg-accent" />
      <div className="flex flex-1 flex-col px-[12mm] py-[12mm]">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <Logo src={logoSrc} />
            <div>
              <p className="text-[20px] font-semibold leading-7">{invoice.from.name || "Your business"}</p>
              <PartyBlock label="" party={invoice.from} showPhone hideName />
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <p className="text-[28px] font-semibold leading-9 tracking-tight">Invoice</p>
            <StatusBadge invoice={invoice} />
            <Meta invoice={invoice} />
          </div>
        </div>

        <div className="my-6 h-px bg-border" />

        <div className="mb-6 grid grid-cols-2 gap-6">
          <PartyBlock label="Bill to" party={invoice.to} />
          <div className="text-right text-[12px] leading-4 text-muted">
            {invoice.currency} · {invoice.locale === "en-GB" ? "DD/MM/YYYY" : "MM/DD/YYYY"}
          </div>
        </div>

        <LineTable invoice={invoice} totals={totals} variant="classic" />

        <div className="mt-6 flex items-start justify-between gap-6">
          <Notes invoice={invoice} />
          <Totals invoice={invoice} totals={totals} variant="classic" />
        </div>
      </div>
    </div>
  );
}
