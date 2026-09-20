import { LandingPage } from "@/components/landing/LandingPage";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "InvoiceMaker",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Free invoice generator and invoice maker for VAT invoices, US sales tax, and GST. Create and download PDFs in the browser.",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "0",
    highPrice: "7.99",
    priceCurrency: "USD",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
