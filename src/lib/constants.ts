export const DRAFT_KEY = "invoice-draft-v1";
export const PRO_KEY = "invoice-pro-v1";
export const PRODUCT_NAME = "InvoiceMaker";

export const CURRENCIES: Array<{
  code: "USD" | "EUR" | "GBP" | "INR";
  label: string;
  symbol: string;
}> = [
  { code: "USD", label: "USD · $", symbol: "$" },
  { code: "EUR", label: "EUR · €", symbol: "€" },
  { code: "GBP", label: "GBP · £", symbol: "£" },
  { code: "INR", label: "INR · ₹", symbol: "₹" },
];

export const LOCALES: Array<{ code: "en-US" | "en-GB"; label: string }> = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK / EU)" },
];

export const GST_RATES = [0, 5, 12, 18, 28] as const;

export const PRICING = {
  oneTime: 7.99,
  monthly: 2.99,
} as const;

export const TEMPLATES: Array<{
  id: "classic" | "minimal" | "bold";
  name: string;
  blurb: string;
}> = [
  { id: "classic", name: "Classic", blurb: "Accent header, clean table — freelancers" },
  { id: "minimal", name: "Minimal", blurb: "Oversized type, hairline rules — consulting" },
  { id: "bold", name: "Bold", blurb: "Full-bleed band, strong hierarchy — SMBs" },
];
