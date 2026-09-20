import type { Invoice, TaxBreakdown } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { LineTable, Logo, Notes, PartyBlock, StatusBadge, Totals } from "./shared";

export function MinimalTemplate({
  invoice,
  totals,
  logoSrc,
}: {
  invoice: Invoice;
  totals: TaxBreakdown;
  logoSrc?: string;
}) {
  return (
    <div className="flex min-h-[1123px] flex-col px-[12mm] py-[14mm]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-[36px] font-semibold leading-[44px] tracking-tight">INVOICE</p>
          <div className="mt-2 flex items-center gap-2">
            <Logo src={logoSrc} />
            <StatusBadge invoice={invoice} />
          </div>
        </div>
        <div className="text-right text-sm leading-5">
          <p className="font-medium">{invoice.number || "—"}</p>
          <p className="text-muted">Issued {formatDate(invoice.issueDate, invoice.locale)}</p>
          <p className="text-muted">Due {formatDate(invoice.dueDate, invoice.locale)}</p>
        </div>
      </div>

      <div className="my-8 h-px bg-border" />

      <div className="mb-8 grid grid-cols-2 gap-8">
        <div>
          <p className="mb-1 text-sm leading-5 text-muted">From</p>
          <PartyBlock label="" party={invoice.from} showPhone />
        </div>
        <div>
          <p className="mb-1 text-sm leading-5 text-muted">Bill to</p>
          <PartyBlock label="" party={invoice.to} />
        </div>
      </div>

      <LineTable invoice={invoice} totals={totals} variant="minimal" />

      <div className="mt-8 flex items-start justify-between gap-6">
        <Notes invoice={invoice} />
        <Totals invoice={invoice} totals={totals} variant="minimal" />
      </div>
    </div>
  );
}
