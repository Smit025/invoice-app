import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["html2canvas", "jspdf"],
  // Checkout URLs are public. Inlining lets client components read the
  // server env names Susmit set (`LEMONSQUEEZY_CHECKOUT_URL*`) at build time.
  env: {
    LEMONSQUEEZY_CHECKOUT_URL: process.env.LEMONSQUEEZY_CHECKOUT_URL ?? "",
    LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: process.env.LEMONSQUEEZY_CHECKOUT_URL_MONTHLY ?? "",
  },
};

export default nextConfig;
