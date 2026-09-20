import type { Currency, Invoice, Locale } from "./types";
import { computeTotals } from "./tax";

export function formatMoney(amount: number, currency: Currency, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(iso: string, locale: Locale): string {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  );
}

export function pdfFilename(invoice: Invoice): string {
  const number = (invoice.number || "invoice").replace(/[^\w.-]+/g, "-");
  return `${number}-${slugify(invoice.to.name || "client")}.pdf`;
}

export function dueStatus(
  invoice: Pick<Invoice, "dueDate">,
  today = new Date(),
): "due" | "overdue" | null {
  if (!invoice.dueDate) return null;
  const due = new Date(`${invoice.dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  return due < today ? "overdue" : "due";
}

export function formatAddressLines(
  party: Invoice["from"],
): string[] {
  const locality = [party.city, party.region, party.postal].filter(Boolean).join(", ");
  const hasBody = Boolean(
    party.name?.trim() || party.address1?.trim() || party.address2?.trim() || locality,
  );
  const lines = [party.address1, party.address2, locality];
  if (hasBody && party.country) lines.push(party.country);
  return lines.filter((line): line is string => Boolean(line && String(line).trim()));
}

export function invoiceHasLiveData(invoice: Invoice): boolean {
  const hasFrom = invoice.from.name.trim().length > 0;
  const hasItem = invoice.items.some(
    (item) => item.description.trim().length > 0 || item.rate > 0,
  );
  return hasFrom || hasItem;
}

export { computeTotals };
