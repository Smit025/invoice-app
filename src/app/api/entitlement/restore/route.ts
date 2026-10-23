import { NextResponse, type NextRequest } from "next/server";
import {
  EntitlementStoreNotConfiguredError,
  getEntitlementStore,
  recordIsActive,
  type EntitlementRecord,
} from "@/lib/entitlement-store";
import { hashEmail } from "@/lib/email-hash";
import { isInstallUserId } from "@/lib/install-id";
import { getProVariantIds } from "@/lib/lemon-config";
import { verifyLemonRestore } from "@/lib/lemon-restore";
import { getLemonServerConfig } from "@/lib/lemon-server";
import { RESTORE_LIMIT, RESTORE_WINDOW_MS, takeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function snapshot(record: EntitlementRecord) {
  const active = recordIsActive(record);
  return {
    status: active ? "active" : "inactive",
    plan: record.plan,
    endsAt: record.endsAt,
    renewsAt: record.renewsAt,
  };
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const headerId = request.headers.get("x-install-id")?.trim() ?? "";
  if (!takeRateLimit(`restore:ip:${ip}`, RESTORE_LIMIT, RESTORE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
  }
  if (!isInstallUserId(headerId)) {
    return NextResponse.json({ error: "Enter the email and order number from your receipt." }, { status: 400, headers: NO_STORE });
  }
  const installId = headerId.toLowerCase();
  if (!takeRateLimit(`restore:id:${installId}`, RESTORE_LIMIT, RESTORE_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: NO_STORE });
  }

  let email = "";
  let orderId = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object") {
      const record = body as { email?: unknown; orderId?: unknown };
      if (typeof record.email === "string") email = record.email.trim();
      if (typeof record.orderId === "string") orderId = record.orderId.trim();
    }
  } catch {
    return NextResponse.json({ error: "Enter the email and order number from your receipt." }, { status: 400, headers: NO_STORE });
  }

  if (!email.includes("@") || email.length > 320 || !ORDER_ID_PATTERN.test(orderId)) {
    return NextResponse.json({ error: "Enter the email and order number from your receipt." }, { status: 400, headers: NO_STORE });
  }

  const storeId = getLemonServerConfig().storeId;
  if (!storeId) {
    return NextResponse.json({ error: "LEMONSQUEEZY_STORE_ID is not set" }, { status: 503, headers: NO_STORE });
  }

  let store;
  try {
    store = getEntitlementStore();
  } catch (error) {
    if (error instanceof EntitlementStoreNotConfiguredError) {
      return NextResponse.json({ error: "Entitlement store is not configured" }, { status: 503, headers: NO_STORE });
    }
    throw error;
  }

  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim();
  if (apiKey) {
    try {
      const verified = await verifyLemonRestore({
        apiKey,
        orderId,
        email,
        storeId,
        installId,
        variants: getProVariantIds(),
        allowTestMode: process.env.VERCEL_ENV === "preview",
      });
      if (!verified.ok) {
        return NextResponse.json({ error: "That receipt doesn't match a paid subscription." }, { status: 404, headers: NO_STORE });
      }
      const outcome = await store.rebindInstall(verified.record);
      if (outcome === "refunded") {
        return NextResponse.json({ error: "That receipt doesn't match a paid subscription." }, { status: 404, headers: NO_STORE });
      }
      return NextResponse.json(snapshot(verified.record), { status: 200, headers: NO_STORE });
    } catch {
      return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500, headers: NO_STORE });
    }
  }

  let order;
  try {
    order = await store.getOrder(orderId);
  } catch {
    return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500, headers: NO_STORE });
  }
  if (!order || order.emailHash !== hashEmail(email)) {
    return NextResponse.json({ error: "That receipt doesn't match a paid subscription." }, { status: 404, headers: NO_STORE });
  }

  let existing;
  try {
    existing = await store.getBySubscriptionId(order.subscriptionId);
  } catch {
    return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500, headers: NO_STORE });
  }
  if (!existing || existing.refunded) {
    return NextResponse.json({ error: "That receipt doesn't match a paid subscription." }, { status: 404, headers: NO_STORE });
  }

  const rebound: EntitlementRecord = { ...existing, userId: installId };
  try {
    const outcome = await store.rebindInstall(rebound);
    if (outcome === "refunded") {
      return NextResponse.json({ error: "That receipt doesn't match a paid subscription." }, { status: 404, headers: NO_STORE });
    }
  } catch {
    return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500, headers: NO_STORE });
  }
  const fresh = (await store.getBySubscriptionId(order.subscriptionId)) ?? rebound;
  return NextResponse.json(snapshot(fresh), { status: 200, headers: NO_STORE });
}
