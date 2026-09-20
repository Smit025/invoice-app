export type Currency = "USD" | "EUR" | "GBP" | "INR";
export type Locale = "en-US" | "en-GB";
export type TaxMode = "none" | "sales_tax" | "vat" | "gst";
export type TemplateId = "classic" | "minimal" | "bold";
export type Theme = "light" | "dark";

export type Address = {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  taxId?: string;
  email?: string;
  phone?: string;
};

export type LineItem = {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  hsn?: string;
};

export type Invoice = {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  locale: Locale;
  currency: Currency;
  from: Address;
  to: Address;
  items: LineItem[];
  taxMode: TaxMode;
  taxRate?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  notes?: string;
  paymentTerms?: string;
  templateId: TemplateId;
  logoDataUrl?: string;
  theme: Theme;
};

export type DraftStore = {
  v: 1;
  currentId: string;
  drafts: Invoice[];
};

export type TaxBreakdown = {
  items: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  taxLabel: string;
  cgst: number;
  sgst: number;
  igst: number;
  intraState: boolean;
};

export type PaywallReason = "watermark" | "logo" | "drafts" | "pdf" | "pricing";
