import { NextResponse, type NextRequest } from "next/server";
import {
  EntitlementStoreNotConfiguredError,
  getEntitlementStore,
} from "@/lib/entitlement-store";
import { persistLemonWebhook } from "@/lib/lemon-entitlement";
import { getLemonServerConfig } from "@/lib/lemon-server";
import { getLemonEventName, summarizeLemonWebhook, verifyLemonSignature } from "@/lib/lemon-webhook";

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

  const storeId = getLemonServerConfig().storeId;
  if (!storeId) {
    return NextResponse.json({ error: "LEMONSQUEEZY_STORE_ID is not set" }, { status: 503 });
  }

  let store;
  try {
    store = getEntitlementStore();
  } catch (error) {
    if (error instanceof EntitlementStoreNotConfiguredError) {
      return NextResponse.json({ error: "Entitlement store is not configured" }, { status: 503 });
    }
    throw error;
  }

  let outcome;
  try {
    outcome = await persistLemonWebhook(payload, store, {
      storeId,
      allowTestMode: process.env.VERCEL_ENV === "preview",
    });
  } catch (error) {
    if (error instanceof EntitlementStoreNotConfiguredError) {
      return NextResponse.json({ error: "Entitlement store is not configured" }, { status: 503 });
    }
    console.error("[lemonsqueezy webhook] store failed");
    return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500 });
  }

  const eventName = getLemonEventName(payload);
  const summary = summarizeLemonWebhook(payload);
  console.info("[lemonsqueezy webhook]", eventName ?? "unknown", {
    id: summary.id,
    type: summary.type,
    action: outcome.action,
    variantId: outcome.variantId,
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
