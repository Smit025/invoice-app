import { NextResponse, type NextRequest } from "next/server";
import { getPublicCheckoutUrl } from "@/lib/lemon-config";
import { parseCheckoutPlan } from "@/lib/lemon-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the live `/checkout/buy/` links. This route does not call
 * Lemon's checkouts API, which was creating test-mode `/checkout/cart/` overlays.
 */
function checkoutCapabilities() {
  return {
    sixMonth: Boolean(getPublicCheckoutUrl("sixMonth")),
    monthly: Boolean(getPublicCheckoutUrl("monthly")),
  };
}

export async function GET() {
  return NextResponse.json(checkoutCapabilities());
}

export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const plan = parseCheckoutPlan(
    body && typeof body === "object" ? (body as { plan?: unknown }).plan : undefined,
  );
  if (!plan) {
    return NextResponse.json(
      { error: "plan must be \"monthly\" or \"sixMonth\"" },
      { status: 400 },
    );
  }

  return NextResponse.json({ url: getPublicCheckoutUrl(plan) });
}
