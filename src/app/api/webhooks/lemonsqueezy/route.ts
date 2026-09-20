import { NextResponse, type NextRequest } from "next/server";
import {
  getLemonEventName,
  isLemonEntitlementEvent,
  summarizeLemonWebhook,
  verifyLemonSignature,
} from "@/lib/lemon-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "LEMONSQUEEZY_WEBHOOK_SECRET is not set" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") ?? request.headers.get("X-Signature");

  if (!rawBody || !signature) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyLemonSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventName = getLemonEventName(payload);
  const summary = summarizeLemonWebhook(payload);

  if (isLemonEntitlementEvent(eventName)) {
    console.info("[lemonsqueezy webhook]", eventName, {
      id: summary.id,
      type: summary.type,
    });
  } else {
    console.info("[lemonsqueezy webhook]", eventName ?? "unknown");
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
