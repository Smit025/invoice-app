export const ENTITLEMENT_EVENT = "invoice-entitlement";
export const CHECKOUT_CONFIRMED_EVENT = "invoice-checkout-confirmed";

export type EntitlementSnapshot = {
  status: "active" | "inactive" | "not_found";
  plan?: "monthly" | "sixMonth" | null;
  endsAt?: string | null;
  renewsAt?: string | null;
};

export function publishEntitlement(snapshot: EntitlementSnapshot): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<EntitlementSnapshot>(ENTITLEMENT_EVENT, { detail: snapshot }));
}

export function readEntitlementSnapshot(event: Event): EntitlementSnapshot | null {
  const detail = (event as CustomEvent<EntitlementSnapshot>).detail;
  if (!detail || typeof detail !== "object") return null;
  if (detail.status !== "active" && detail.status !== "inactive" && detail.status !== "not_found") return null;
  return detail;
}

export async function fetchEntitlement(userId: string): Promise<EntitlementSnapshot | null> {
  const response = await fetch(`/api/entitlement?user_id=${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!body || typeof body !== "object") return null;
  const status = (body as { status?: unknown }).status;
  if (status !== "active" && status !== "inactive" && status !== "not_found") return null;
  const record = body as {
    plan?: unknown;
    endsAt?: unknown;
    renewsAt?: unknown;
  };
  return {
    status,
    plan: record.plan === "monthly" || record.plan === "sixMonth" ? record.plan : null,
    endsAt: typeof record.endsAt === "string" ? record.endsAt : null,
    renewsAt: typeof record.renewsAt === "string" ? record.renewsAt : null,
  };
}
