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

/** Finite and ≥ 0; NaN / ±Infinity / negatives become 0. */
export function clampNonNegative(value: number, max = 1_000_000_000): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

export function clampTaxRate(value: number): number {
  return Math.min(100, clampNonNegative(value));
}

export function parseNonNegativeInput(raw: string, max?: number): number {
  if (raw.trim() === "") return 0;
  return clampNonNegative(Number(raw), max);
}

export function lineAmount(qty: number, rate: number): number {
  const amount = clampNonNegative(qty) * clampNonNegative(rate);
  if (!Number.isFinite(amount)) return 0;
  return roundHalfUp(amount);
}

/**
 * Split one already-rounded tax amount: cgst = round(tax/2), sgst = tax - cgst.
 * Done in integer cents so CGST + SGST === tax === IGST with no leftover penny.
 */
export function splitGstHalves(tax: number): { cgst: number; sgst: number } {
  const taxCents = Math.round(clampNonNegative(tax) * 100);
  const cgstCents = Math.round(taxCents / 2);
  const sgstCents = taxCents - cgstCents;
  return { cgst: cgstCents / 100, sgst: sgstCents / 100 };
}

function normalizeRegion(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCountry(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export type GstPlace = "incomplete" | "intra" | "inter";

/** GST split is only valid when both parties are in India with a non-empty state. */
export function gstPlaceOfSupply(invoice: Pick<Invoice, "from" | "to">): GstPlace {
  const fromCountry = normalizeCountry(invoice.from.country);
  const toCountry = normalizeCountry(invoice.to.country);
  const from = normalizeRegion(invoice.from.region);
  const to = normalizeRegion(invoice.to.region);
  if (fromCountry !== "IN" || toCountry !== "IN" || !from || !to) {
    return "incomplete";
  }
  return from === to ? "intra" : "inter";
}

export function isIntraState(invoice: Pick<Invoice, "from" | "to">): boolean {
  return gstPlaceOfSupply(invoice) === "intra";
}

function emptyBreakdown(
  items: LineItem[],
  subtotal: number,
  extras: Partial<TaxBreakdown> = {},
): TaxBreakdown {
  return {
    items,
    subtotal,
    tax: 0,
    total: subtotal,
    taxLabel: "",
    cgst: 0,
    sgst: 0,
    igst: 0,
    intraState: false,
    gstIncomplete: false,
    ...extras,
  };
}

export function computeTotals(invoice: Invoice): TaxBreakdown {
  const items: LineItem[] = invoice.items.map((item) => ({
    ...item,
    qty: clampNonNegative(item.qty),
    rate: clampNonNegative(item.rate),
    amount: lineAmount(item.qty, item.rate),
  }));

  const subtotal = roundHalfUp(items.reduce((sum, item) => sum + item.amount, 0));
  const rate = clampTaxRate(invoice.taxRate ?? 0);

  if (invoice.taxMode === "none" || rate === 0) {
    return emptyBreakdown(items, subtotal, {
      taxLabel:
        invoice.taxMode === "vat"
          ? "VAT"
          : invoice.taxMode === "sales_tax"
            ? "Sales tax"
            : invoice.taxMode === "gst"
              ? "GST"
              : "",
      gstIncomplete: invoice.taxMode === "gst" && gstPlaceOfSupply(invoice) === "incomplete",
    });
  }

  if (invoice.taxMode === "sales_tax") {
    const tax = roundHalfUp((subtotal * rate) / 100);
    return emptyBreakdown(items, subtotal, {
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "Sales tax",
    });
  }

  if (invoice.taxMode === "vat") {
    const tax = roundHalfUp((subtotal * rate) / 100);
    return emptyBreakdown(items, subtotal, {
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "VAT",
    });
  }

  if (invoice.taxMode === "gst") {
    const place = gstPlaceOfSupply(invoice);
    if (place === "incomplete") {
      return emptyBreakdown(items, subtotal, {
        taxLabel: "GST",
        gstIncomplete: true,
      });
    }

    const tax = roundHalfUp((subtotal * rate) / 100);
    if (place === "intra") {
      const { cgst, sgst } = splitGstHalves(tax);
      return emptyBreakdown(items, subtotal, {
        tax,
        total: roundHalfUp(subtotal + tax),
        taxLabel: "GST",
        cgst,
        sgst,
        igst: 0,
        intraState: true,
      });
    }

    return emptyBreakdown(items, subtotal, {
      tax,
      total: roundHalfUp(subtotal + tax),
      taxLabel: "IGST",
      igst: tax,
      intraState: false,
    });
  }

  return emptyBreakdown(items, subtotal);
}
