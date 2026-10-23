import type { NextConfig } from "next";
import { readSupportEmail } from "./src/lib/support-email";

if (process.env.VERCEL_ENV === "production" && !readSupportEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL)) {
  console.warn(
    "Warning: NEXT_PUBLIC_SUPPORT_EMAIL is unset. The recovery line stays hidden until a support address is set. This build continues.",
  );
}

const nextConfig: NextConfig = {
  transpilePackages: ["html2canvas", "jspdf"],
};

export default nextConfig;
