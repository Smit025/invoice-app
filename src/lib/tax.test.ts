import { describe, expect, it } from "vitest";
import {
  clampNonNegative,
  computeTotals,
  gstPlaceOfSupply,
  lineAmount,
  roundHalfUp,
  splitGstHalves,
} from "./tax";
import type { Address, Invoice } from "./types";

function party(region: string, country = "IN"): Address {
  return {
    name: "Co",
    address1: "1",
    city: "City",
    region,
    postal: "000000",
    country,
  };
}

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "1",
    number: "INV-0001",
    issueDate: "2026-04-01",
    dueDate: "2026-04-15",
    locale: "en-US",
    currency: "USD",
    from: {
      name: "From Co",
      address1: "1 Main",
      city: "Austin",
      region: "TX",
      postal: "78701",
      country: "US",
    },
    to: {
      name: "To Co",
      address1: "2 High",
      city: "Austin",
      region: "TX",
      postal: "78702",
      country: "US",
    },
    items: [{ id: "a", description: "Work", qty: 1, rate: 100, amount: 0 }],
    taxMode: "none",
    taxRate: 0,
    templateId: "classic",
    theme: "light",
    ...overrides,
  };
}

describe("roundHalfUp", () => {
  it("rounds .5 away from zero to 2dp", () => {
    expect(roundHalfUp(1.005)).toBe(1.01);
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(1.004)).toBe(1);
    expect(roundHalfUp(10.555)).toBe(10.56);
  });
});

describe("clampNonNegative / lineAmount", () => {
  it("qty × rate then half-up 2dp", () => {
    expect(lineAmount(1, 10.555)).toBe(10.56);
    expect(lineAmount(2, 19.99)).toBe(39.98);
    expect(lineAmount(3, 0.1)).toBe(0.3);
    expect(lineAmount(1.5, 100)).toBe(150);
  });

  it("clamps non-finite and negative qty/rate to 0", () => {
    expect(clampNonNegative(-3)).toBe(0);
    expect(clampNonNegative(Number.NaN)).toBe(0);
    expect(clampNonNegative(Number.POSITIVE_INFINITY)).toBe(0);
    expect(lineAmount(-2, 10)).toBe(0);
    expect(lineAmount(2, -10)).toBe(0);
    expect(lineAmount(Number.NaN, 10)).toBe(0);
  });
});

describe("computeTotals", () => {
  it("none: total equals subtotal", () => {
    const t = computeTotals(
      invoice({
        items: [
          { id: "1", description: "A", qty: 2, rate: 50, amount: 0 },
          { id: "2", description: "B", qty: 1, rate: 25.555, amount: 0 },
        ],
      }),
    );
    expect(t.subtotal).toBe(125.56);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(125.56);
  });

  it("sales tax: exclusive % on subtotal", () => {
    const t = computeTotals(
      invoice({
        taxMode: "sales_tax",
        taxRate: 8.875,
        items: [{ id: "1", description: "A", qty: 1, rate: 100, amount: 0 }],
      }),
    );
    expect(t.subtotal).toBe(100);
    expect(t.tax).toBe(8.88);
    expect(t.total).toBe(108.88);
    expect(t.taxLabel).toBe("Sales tax");
  });

  it("vat: exclusive % labeled VAT", () => {
    const t = computeTotals(
      invoice({
        taxMode: "vat",
        taxRate: 20,
        items: [{ id: "1", description: "A", qty: 1, rate: 80, amount: 0 }],
      }),
    );
    expect(t.tax).toBe(16);
    expect(t.total).toBe(96);
    expect(t.taxLabel).toBe("VAT");
  });

  it("gst intra-state: CGST + SGST split from one tax amount", () => {
    const t = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: party("Maharashtra"),
        to: party("Maharashtra"),
        items: [{ id: "1", description: "A", qty: 1, rate: 1000, amount: 0 }],
      }),
    );
    expect(t.intraState).toBe(true);
    expect(t.gstIncomplete).toBe(false);
    expect(t.cgst).toBe(90);
    expect(t.sgst).toBe(90);
    expect(t.igst).toBe(0);
    expect(t.cgst + t.sgst).toBe(t.tax);
    expect(t.tax).toBe(180);
    expect(t.total).toBe(1180);
  });

  it("gst inter-state: IGST", () => {
    const t = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: party("Maharashtra"),
        to: party("Karnataka"),
        items: [{ id: "1", description: "A", qty: 1, rate: 1000, amount: 0 }],
      }),
    );
    expect(t.intraState).toBe(false);
    expect(t.gstIncomplete).toBe(false);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.igst).toBe(180);
    expect(t.taxLabel).toBe("IGST");
    expect(t.total).toBe(1180);
  });

  it("gst blank regions do not invent CGST+SGST", () => {
    const bothBlank = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: party(""),
        to: party(""),
      }),
    );
    expect(gstPlaceOfSupply(invoice({ from: party(""), to: party("") }))).toBe("incomplete");
    expect(bothBlank.gstIncomplete).toBe(true);
    expect(bothBlank.cgst).toBe(0);
    expect(bothBlank.sgst).toBe(0);
    expect(bothBlank.igst).toBe(0);
    expect(bothBlank.tax).toBe(0);
    expect(bothBlank.total).toBe(bothBlank.subtotal);

    const oneBlank = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: party("Maharashtra"),
        to: party(""),
      }),
    );
    expect(oneBlank.gstIncomplete).toBe(true);
    expect(oneBlank.tax).toBe(0);

    const notIndia = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: party("Maharashtra", "US"),
        to: party("Maharashtra", "US"),
      }),
    );
    expect(notIndia.gstIncomplete).toBe(true);
    expect(notIndia.tax).toBe(0);
  });

  it("CGST+SGST always equals full GST tax (same as IGST) — property", () => {
    const rates = [5, 12, 18, 28];
    const amounts = [1, 1.11, 10.55, 99.99, 100, 333.33, 1000, 1234.56];
    for (const taxRate of rates) {
      for (const rate of amounts) {
        const items = [{ id: "1", description: "A", qty: 1, rate, amount: 0 }];
        const intra = computeTotals(
          invoice({
            taxMode: "gst",
            taxRate,
            from: party("Maharashtra"),
            to: party("Maharashtra"),
            items,
          }),
        );
        const inter = computeTotals(
          invoice({
            taxMode: "gst",
            taxRate,
            from: party("Maharashtra"),
            to: party("Karnataka"),
            items,
          }),
        );
        expect(roundHalfUp(intra.cgst + intra.sgst)).toBe(intra.tax);
        expect(roundHalfUp(intra.cgst + intra.sgst)).toBe(inter.igst);
        expect(splitGstHalves(intra.tax)).toEqual({ cgst: intra.cgst, sgst: intra.sgst });
        expect(intra.tax).toBe(inter.igst);
        expect(intra.tax).toBe(inter.tax);
      }
    }
  });

  it("rounds in order: lines → subtotal → tax → total", () => {
    const t = computeTotals(
      invoice({
        taxMode: "vat",
        taxRate: 20,
        items: [
          { id: "1", description: "A", qty: 1, rate: 10.555, amount: 0 },
          { id: "2", description: "B", qty: 1, rate: 10.555, amount: 0 },
        ],
      }),
    );
    expect(t.items[0].amount).toBe(10.56);
    expect(t.items[1].amount).toBe(10.56);
    expect(t.subtotal).toBe(21.12);
    expect(t.tax).toBe(4.22);
    expect(t.total).toBe(25.34);
  });

  it("clamps negative taxRate", () => {
    const t = computeTotals(invoice({ taxMode: "vat", taxRate: -20 }));
    expect(t.tax).toBe(0);
    expect(t.total).toBe(t.subtotal);
  });

  it("mixed IN/US countries stay incomplete even with matching region names", () => {
    const mixed = invoice({
      taxMode: "gst",
      taxRate: 18,
      from: party("Maharashtra", "IN"),
      to: party("Maharashtra", "US"),
    });
    const t = computeTotals(mixed);
    expect(gstPlaceOfSupply(mixed)).toBe("incomplete");
    expect(t.gstIncomplete).toBe(true);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.tax).toBe(0);
  });
});

describe("splitGstHalves", () => {
  it("remainder split: cgst = round(tax/2), sgst = tax - cgst", () => {
    expect(splitGstHalves(61.73)).toEqual({ cgst: 30.87, sgst: 30.86 });
    expect(splitGstHalves(180)).toEqual({ cgst: 90, sgst: 90 });
    expect(splitGstHalves(0.01)).toEqual({ cgst: 0.01, sgst: 0 });
  });
});
