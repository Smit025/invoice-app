import { NextResponse, type NextRequest } from "next/server";
import {
  createLemonCheckout,
  getLemonServerConfig,
  isApiCheckoutConfigured,
  parseCheckoutPlan,
} from "@/lib/lemon-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function checkoutCapabilities() {
  const config = getLemonServerConfig();
  return {
    oneTime: isApiCheckoutConfigured("onetime", config),
    monthly: isApiCheckoutConfigured("monthly", config),
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
      { error: "plan must be \"onetime\" or \"monthly\"" },
      { status: 400 },
    );
  }

  const origin = request.nextUrl.origin;
  const result = await createLemonCheckout({ plan, origin });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ url: result.url });
}
