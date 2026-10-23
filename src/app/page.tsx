import { LandingPage } from "@/components/landing/LandingPage";
import { PRICE_LABEL, PRICING } from "@/lib/constants";

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
    lowPrice: String(PRICING.monthly),
    highPrice: String(PRICING.sixMonth),
    priceCurrency: "USD",
    offerCount: "2",
    description: `Pro ${PRICE_LABEL.monthly}, or Pro ${PRICE_LABEL.sixMonth}.`,
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
