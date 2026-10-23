import { hasCheckoutStarted, noteCheckoutEntitlement } from "./install-id";

export const ENTITLEMENT_EVENT = "invoice-entitlement";
export const CHECKOUT_CONFIRMED_EVENT = "invoice-checkout-confirmed";
export const ENTITLEMENT_CACHE_KEY = "invoice-entitlement-cache-v1";

/** Slow path. The fast poll on /thanks does not use this. */
export const ENTITLEMENT_TTL_MS = 15 * 60 * 1000;
/** How long a previously active snapshot survives a Redis outage. */
export const ENTITLEMENT_GRACE_MS = 15 * 60 * 1000;
export const FAST_POLL_MS = 5000;
export const FAST_POLL_WINDOW_MS = 3 * 60 * 1000;

export type EntitlementSnapshot = {
  status: "active" | "inactive" | "not_found";
  plan?: "monthly" | "sixMonth" | null;
  endsAt?: string | null;
  renewsAt?: string | null;
};

type CachedEntitlement = {
  snapshot: EntitlementSnapshot;
  fetchedAt: number;
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

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedEntitlement(): CachedEntitlement | null {
  const raw = browserStorage()?.getItem(ENTITLEMENT_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const body = parsed as { snapshot?: EntitlementSnapshot; fetchedAt?: unknown };
    if (!body.snapshot || typeof body.fetchedAt !== "number") return null;
    if (
      body.snapshot.status !== "active" &&
      body.snapshot.status !== "inactive" &&
      body.snapshot.status !== "not_found"
    ) {
      return null;
    }
    return { snapshot: body.snapshot, fetchedAt: body.fetchedAt };
  } catch {
    return null;
  }
}

function writeCachedEntitlement(snapshot: EntitlementSnapshot): void {
  browserStorage()?.setItem(
    ENTITLEMENT_CACHE_KEY,
    JSON.stringify({ snapshot, fetchedAt: Date.now() } satisfies CachedEntitlement),
  );
}

/** A failed read may keep Pro that the server already confirmed. It never creates Pro. */
export function cachedActiveDuringOutage(now = Date.now()): EntitlementSnapshot | null {
  const cached = readCachedEntitlement();
  if (!cached || cached.snapshot.status !== "active") return null;
  if (now - cached.fetchedAt > ENTITLEMENT_GRACE_MS) return null;
  return cached.snapshot;
}

export function shouldQueryEntitlement(input: { fresh: boolean; fast: boolean }): boolean {
  const cached = readCachedEntitlement();
  const remembered = cached !== null && cached.snapshot.status !== "not_found";
  if (!hasCheckoutStarted() && !remembered) return false;
  if (input.fast || input.fresh) return true;
  if (!cached) return true;
  return Date.now() - cached.fetchedAt >= ENTITLEMENT_TTL_MS;
}

export async function fetchEntitlement(
  userId: string,
  options?: { fresh?: boolean },
): Promise<EntitlementSnapshot | null> {
  try {
    const response = await fetch("/api/entitlement", {
      method: "GET",
      headers: { "X-Install-Id": userId },
      cache: options?.fresh ? "no-store" : "default",
    });
    if (response.status >= 500 || response.status === 429) return cachedActiveDuringOutage();
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== "object") return null;
    const status = (body as { status?: unknown }).status;
    if (status !== "active" && status !== "inactive" && status !== "not_found") return null;
    const record = body as { plan?: unknown; endsAt?: unknown; renewsAt?: unknown };
    const snapshot: EntitlementSnapshot = {
      status,
      plan: record.plan === "monthly" || record.plan === "sixMonth" ? record.plan : null,
      endsAt: typeof record.endsAt === "string" ? record.endsAt : null,
      renewsAt: typeof record.renewsAt === "string" ? record.renewsAt : null,
    };
    writeCachedEntitlement(snapshot);
    noteCheckoutEntitlement(status);
    return snapshot;
  } catch {
    return cachedActiveDuringOutage();
  }
}
