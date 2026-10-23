import { NextResponse, type NextRequest } from "next/server";
import {
  EntitlementStoreNotConfiguredError,
  getEntitlementStore,
  recordIsActive,
} from "@/lib/entitlement-store";
import { isInstallUserId } from "@/lib/install-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id")?.trim() ?? "";
  if (!isInstallUserId(userId)) {
    return NextResponse.json({ status: "not_found" }, { status: 200, headers: noStore });
  }

  let store;
  try {
    store = getEntitlementStore();
  } catch (error) {
    if (error instanceof EntitlementStoreNotConfiguredError) {
      return NextResponse.json({ error: "Entitlement store is not configured" }, { status: 503, headers: noStore });
    }
    throw error;
  }

  let record;
  try {
    record = await store.getByUserId(userId);
  } catch {
    return NextResponse.json({ error: "Entitlement store request failed" }, { status: 500, headers: noStore });
  }

  if (!record || record.userId !== userId) {
    return NextResponse.json({ status: "not_found" }, { status: 200, headers: noStore });
  }

  const active = recordIsActive(record);
  return NextResponse.json(
    {
      status: active ? "active" : "inactive",
      plan: record.plan,
      endsAt: record.endsAt,
      renewsAt: record.renewsAt,
    },
    { status: 200, headers: noStore },
  );
}
