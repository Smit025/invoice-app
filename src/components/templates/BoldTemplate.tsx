import type { Invoice, TaxBreakdown } from "@/lib/types";
import { LineTable, Logo, Notes, PartyBlock, StatusBadge, Totals } from "./shared";

export function BoldTemplate({
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
      <div className="flex h-24 items-center justify-between bg-accent px-[12mm] text-[#ffffff]">
        <div className="flex items-center gap-3">
          <Logo src={logoSrc} />
          <div>
            <p className="text-[28px] font-semibold leading-9">Invoice</p>
            <p className="text-sm text-[#ffffffcc]">{invoice.from.name || "Your business"}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{invoice.number || "—"}</p>
          <StatusBadge invoice={invoice} />
        </div>
      </div>

      <div className="flex flex-1 flex-col px-[12mm] py-[12mm]">
        <div className="mb-6 grid grid-cols-2 gap-6">
          <PartyBlock label="From" party={invoice.from} showPhone />
          <PartyBlock label="Bill to" party={invoice.to} />
        </div>

        <LineTable invoice={invoice} totals={totals} variant="bold" />

        <div className="mt-6 flex items-start justify-between gap-6">
          <Notes invoice={invoice} />
          <Totals invoice={invoice} totals={totals} variant="bold" />
        </div>
      </div>
    </div>
  );
}
