import { NextResponse, type NextRequest } from "next/server";
import {
  EntitlementStoreNotConfiguredError,
  getEntitlementStore,
  recordIsActive,
} from "@/lib/entitlement-store";
import { isInstallUserId } from "@/lib/install-id";
import {
  ENTITLEMENT_ID_LIMIT,
  ENTITLEMENT_ID_WINDOW_MS,
  ENTITLEMENT_IP_LIMIT,
  ENTITLEMENT_IP_WINDOW_MS,
  takeRateLimit,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const PRIVATE_CACHE = "private, max-age=900";
const NOT_FOUND_CACHE = "private, max-age=60";
const NO_STORE = "no-store";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function installIdFrom(request: NextRequest, bodyId?: string): string {
  const header = request.headers.get("x-install-id")?.trim();
  if (header) return header;
  return bodyId?.trim() ?? "";
}

async function lookup(request: NextRequest, userId: string) {
  const ip = clientIp(request);
  if (!takeRateLimit(`entitlement:ip:${ip}`, ENTITLEMENT_IP_LIMIT, ENTITLEMENT_IP_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Cache-Control": NO_STORE } });
  }

  if (!isInstallUserId(userId)) {
    return NextResponse.json(
      { status: "not_found" },
      { status: 200, headers: { "Cache-Control": NOT_FOUND_CACHE, Vary: "X-Install-Id" } },
    );
  }
  const installId = userId.trim().toLowerCase();
  if (!takeRateLimit(`entitlement:id:${installId}`, ENTITLEMENT_ID_LIMIT, ENTITLEMENT_ID_WINDOW_MS)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Cache-Control": NO_STORE } });
  }

  let store;
  try {
    store = getEntitlementStore();
  } catch (error) {
    if (error instanceof EntitlementStoreNotConfiguredError) {
      return NextResponse.json(
        { error: "Entitlement store is not configured" },
        { status: 503, headers: { "Cache-Control": NO_STORE } },
      );
    }
    throw error;
  }

  let record;
  try {
    record = await store.getByUserId(installId);
  } catch {
    return NextResponse.json(
      { error: "Entitlement store request failed" },
      { status: 500, headers: { "Cache-Control": NO_STORE } },
    );
  }

  if (!record || record.userId !== installId) {
    return NextResponse.json(
      { status: "not_found" },
      { status: 200, headers: { "Cache-Control": NOT_FOUND_CACHE, Vary: "X-Install-Id" } },
    );
  }

  const active = recordIsActive(record);
  return NextResponse.json(
    {
      status: active ? "active" : "inactive",
      plan: record.plan,
      endsAt: record.endsAt,
      renewsAt: record.renewsAt,
    },
    { status: 200, headers: { "Cache-Control": PRIVATE_CACHE, Vary: "X-Install-Id" } },
  );
}

export async function GET(request: NextRequest) {
  return lookup(request, installIdFrom(request));
}

export async function POST(request: NextRequest) {
  let bodyId = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && typeof (body as { installId?: unknown }).installId === "string") {
      bodyId = (body as { installId: string }).installId;
    }
  } catch {
    bodyId = "";
  }
  return lookup(request, installIdFrom(request, bodyId));
}
