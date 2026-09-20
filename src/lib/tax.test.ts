import { describe, expect, it } from "vitest";
import { computeTotals, lineAmount, roundHalfUp } from "./tax";
import type { Invoice } from "./types";

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

describe("lineAmount", () => {
  it("qty × rate then half-up 2dp", () => {
    expect(lineAmount(1, 10.555)).toBe(10.56);
    expect(lineAmount(2, 19.99)).toBe(39.98);
    expect(lineAmount(3, 0.1)).toBe(0.3);
    expect(lineAmount(1.5, 100)).toBe(150);
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

  it("gst intra-state: CGST + SGST split", () => {
    const t = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: {
          name: "A",
          address1: "1",
          city: "Mumbai",
          region: "Maharashtra",
          postal: "400001",
          country: "IN",
        },
        to: {
          name: "B",
          address1: "2",
          city: "Pune",
          region: "Maharashtra",
          postal: "411001",
          country: "IN",
        },
        items: [{ id: "1", description: "A", qty: 1, rate: 1000, amount: 0 }],
      }),
    );
    expect(t.intraState).toBe(true);
    expect(t.cgst).toBe(90);
    expect(t.sgst).toBe(90);
    expect(t.igst).toBe(0);
    expect(t.tax).toBe(180);
    expect(t.total).toBe(1180);
  });

  it("gst inter-state: IGST", () => {
    const t = computeTotals(
      invoice({
        taxMode: "gst",
        taxRate: 18,
        from: {
          name: "A",
          address1: "1",
          city: "Mumbai",
          region: "Maharashtra",
          postal: "400001",
          country: "IN",
        },
        to: {
          name: "B",
          address1: "2",
          city: "Bengaluru",
          region: "Karnataka",
          postal: "560001",
          country: "IN",
        },
        items: [{ id: "1", description: "A", qty: 1, rate: 1000, amount: 0 }],
      }),
    );
    expect(t.intraState).toBe(false);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.igst).toBe(180);
    expect(t.taxLabel).toBe("IGST");
    expect(t.total).toBe(1180);
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
});
