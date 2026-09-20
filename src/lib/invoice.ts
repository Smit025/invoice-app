import type { Address, Invoice, LineItem } from "./types";
import { addDays, toISODate } from "./format";

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyAddress(country = "US"): Address {
  return {
    name: "",
    address1: "",
    address2: "",
    city: "",
    region: "",
    postal: "",
    country,
    taxId: "",
    email: "",
    phone: "",
  };
}

export function emptyItem(): LineItem {
  return {
    id: newId(),
    description: "",
    qty: 1,
    rate: 0,
    amount: 0,
    hsn: "",
  };
}

export function createDefaultInvoice(): Invoice {
  const today = new Date();
  return {
    id: newId(),
    number: "INV-0001",
    issueDate: toISODate(today),
    dueDate: toISODate(addDays(today, 14)),
    locale: "en-US",
    currency: "USD",
    from: emptyAddress("US"),
    to: emptyAddress("US"),
    items: [emptyItem()],
    taxMode: "none",
    taxRate: 0,
    notes: "",
    paymentTerms: "Net 14",
    templateId: "classic",
    theme: "light",
  };
}

export function sampleInvoice(templateId: Invoice["templateId"] = "classic"): Invoice {
  const today = new Date();
  return {
    id: "sample",
    number: "INV-1842",
    issueDate: toISODate(today),
    dueDate: toISODate(addDays(today, 14)),
    locale: "en-US",
    currency: "USD",
    from: {
      name: "Northline Studio",
      address1: "410 Dean Street",
      address2: "Suite 4",
      city: "Brooklyn",
      region: "NY",
      postal: "11217",
      country: "US",
      taxId: "12-3456789",
      email: "hello@northline.studio",
    },
    to: {
      name: "Harbor & Co.",
      address1: "22 Shoreditch High Street",
      city: "London",
      region: "",
      postal: "E1 6PJ",
      country: "GB",
      taxId: "GB123456789",
      email: "ap@harbor.co",
    },
    items: [
      {
        id: "s1",
        description: "Brand identity system",
        qty: 1,
        rate: 2400,
        amount: 2400,
      },
      {
        id: "s2",
        description: "Landing page design (4 pages)",
        qty: 4,
        rate: 850,
        amount: 3400,
      },
      {
        id: "s3",
        description: "Design QA & handoff",
        qty: 8,
        rate: 95,
        amount: 760,
      },
    ],
    taxMode: "none",
    taxRate: 0,
    notes: "Thank you for your business. Please include the invoice number with payment.",
    paymentTerms: "Net 14 · ACH or wire",
    templateId,
    theme: "light",
  };
}

export function cloneInvoice(invoice: Invoice): Invoice {
  return structuredClone(invoice);
}
