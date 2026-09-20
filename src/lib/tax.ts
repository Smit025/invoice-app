import type { Invoice, LineItem, TaxBreakdown } from "./types";

/**
 * Half-up rounding to 2 decimal places (away from zero at exactly 0.5).
 * Adds a tiny bias so IEEE-754 artifacts like 1.005 * 100 do not floor incorrectly.
 */
export function roundHalfUp(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const biased = value * factor + Math.sign(value || 1) * 1e-8;
  return Math.round(biased) / factor;
}

export function lineAmount(qty: number, rate: number): number {
  return roundHalfUp((Number(qty) || 0) * (Number(rate) || 0));
}

function normalizeRegion(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function isIntraState(invoice: Pick<Invoice, "from" | "to">): boolean {
  const from = normalizeRegion(invoice.from.region);
  const to = normalizeRegion(invoice.to.region);
  if (!from && !to) return true;
  return from === to;
}

export function computeTotals(invoice: Invoice): TaxBreakdown {
  const items: LineItem[] = invoice.items.map((item) => ({
    ...item,
    amount: lineAmount(item.qty, item.rate),
  }));

  const subtotal = roundHalfUp(items.reduce((sum, item) => sum + item.amount, 0));
  const rate = Number(invoice.taxRate) || 0;

  if (invoice.taxMode === "none" || rate === 0) {
    const intraState = isIntraState(invoice);
    return {
      items,
      subtotal,
      tax: 0,
      total: subtotal,
      taxLabel: invoice.taxMode === "vat" ? "VAT" : invoice.taxMode === "sales_tax" ? "Sales tax" : invoice.taxMode === "gst" ? "GST" : "",
      cgst: 0,
      sgst: 0,
      igst: 0,
      intraState,
    };
  }

  if (invoice.taxMode === "sales_tax") {
    const tax = roundHalfUp((subtotal * rate) / 100);
    return {
      items,
      subtotal,
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "Sales tax",
      cgst: 0,
      sgst: 0,
      igst: 0,
      intraState: true,
    };
  }

  if (invoice.taxMode === "vat") {
    const tax = roundHalfUp((subtotal * rate) / 100);
    return {
      items,
      subtotal,
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "VAT",
      cgst: 0,
      sgst: 0,
      igst: 0,
      intraState: true,
    };
  }

  const intraState = isIntraState(invoice);
  if (intraState) {
    const half = rate / 2;
    const cgst = roundHalfUp((subtotal * half) / 100);
    const sgst = roundHalfUp((subtotal * half) / 100);
    const tax = roundHalfUp(cgst + sgst);
    return {
      items,
      subtotal,
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "GST",
      cgst,
      sgst,
      igst: 0,
      intraState: true,
    };
  }

  const igst = roundHalfUp((subtotal * rate) / 100);
  return {
    items,
    subtotal,
    tax: igst,
    total: roundHalfUp(subtotal + igst),
    taxLabel: "IGST",
    cgst: 0,
    sgst: 0,
    igst,
    intraState: false,
  };
}
