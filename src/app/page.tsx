import { LandingPage } from "@/components/landing/LandingPage";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "InvoiceMaker",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Free invoices with VAT and sales tax in USD, EUR, or GBP. Built for EU and US freelancers. Create and download a PDF in the browser — no signup.",
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
