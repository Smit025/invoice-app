import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "InvoiceMaker — Free Invoice Generator",
    template: "%s · InvoiceMaker",
  },
  description:
    "Free invoices with VAT & sales tax — USD, EUR, or GBP. Built for EU and US freelancers. Create a clean PDF in minutes — no signup.",
  keywords: [
    "invoice generator",
    "free invoice maker",
    "VAT invoice",
    "sales tax invoice",
    "GST invoice",
    "invoice PDF",
  ],
  openGraph: {
    title: "InvoiceMaker — Free Invoice Generator",
    description:
      "Free invoices with VAT & sales tax — USD, EUR, or GBP. Built for EU and US freelancers. Create a clean PDF in minutes — no signup.",
    type: "website",
  },
};

const themeBoot = `try{var r=localStorage.getItem('invoice-draft-v1');if(r){var d=JSON.parse(r);var inv=d.drafts?d.drafts.find(function(x){return x.id===d.currentId})||d.drafts[0]:d;if(inv&&inv.theme)document.documentElement.setAttribute('data-theme',inv.theme);}}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="min-h-full bg-bg font-sans text-text">{children}</body>
    </html>
  );
}
