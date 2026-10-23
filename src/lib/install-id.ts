export const INSTALL_ID_KEY = "invoice-install-v1";
export const CHECKOUT_STARTED_KEY = "invoice-checkout-started-v1";
export const CHECKOUT_NOT_FOUND_SINCE_KEY = "invoice-checkout-not-found-since-v1";
/** Stop asking after a day of continuous not_found. A later checkout starts the clock again. */
export const CHECKOUT_ABANDON_MS = 24 * 60 * 60 * 1000;

/** 16 bytes, hex encoded. 128 bits, not a UUID. */
const INSTALL_ID_PATTERN = /^[0-9a-f]{32}$/i;
const LEGACY_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInstallUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && INSTALL_ID_PATTERN.test(value.trim());
}

export function createInstallId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

let sessionInstallId: string | undefined;
let sessionCheckoutStarted = false;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Opaque per-browser id passed to Lemon as `checkout[custom][user_id]`.
 * A stored UUID from the previous format is replaced once. The server does
 * not accept the old id. Another browser is not attached in this release.
 */
export function getOrCreateInstallId(): string {
  if (typeof window === "undefined") {
    throw new Error("install id is only available in the browser");
  }
  const local = storage();
  if (!local) {
    if (!sessionInstallId || !isInstallUserId(sessionInstallId)) {
      sessionInstallId = createInstallId();
    }
    return sessionInstallId;
  }
  const existing = local.getItem(INSTALL_ID_KEY)?.trim() ?? "";
  if (INSTALL_ID_PATTERN.test(existing)) {
    const normalized = existing.toLowerCase();
    if (existing !== normalized) local.setItem(INSTALL_ID_KEY, normalized);
    return normalized;
  }
  if (LEGACY_UUID_PATTERN.test(existing)) {
    const created = createInstallId();
    local.setItem(INSTALL_ID_KEY, created);
    return created;
  }
  const created = createInstallId();
  local.setItem(INSTALL_ID_KEY, created);
  return created;
}

export function markCheckoutStarted(now = Date.now()): void {
  sessionCheckoutStarted = true;
  const local = storage();
  local?.setItem(CHECKOUT_STARTED_KEY, String(now));
  local?.removeItem(CHECKOUT_NOT_FOUND_SINCE_KEY);
}

export function clearCheckoutStarted(): void {
  sessionCheckoutStarted = false;
  const local = storage();
  local?.removeItem(CHECKOUT_STARTED_KEY);
  local?.removeItem(CHECKOUT_NOT_FOUND_SINCE_KEY);
}

export function hasCheckoutStarted(): boolean {
  if (sessionCheckoutStarted) return true;
  const value = storage()?.getItem(CHECKOUT_STARTED_KEY);
  if (!value) return false;
  if (value === "1") return true;
  const time = Number(value);
  return Number.isFinite(time) && time > 0;
}

/**
 * A not_found answer starts a clock. After {@link CHECKOUT_ABANDON_MS} of
 * continuous not_found, the checkout flag is cleared so polling stops.
 * Active and inactive answers reset that clock. A 500 does not call this.
 */
export function noteCheckoutEntitlement(status: "active" | "inactive" | "not_found", now = Date.now()): void {
  if (!hasCheckoutStarted()) return;
  const local = storage();
  if (status !== "not_found") {
    local?.removeItem(CHECKOUT_NOT_FOUND_SINCE_KEY);
    return;
  }
  const existing = local?.getItem(CHECKOUT_NOT_FOUND_SINCE_KEY);
  const since = existing == null ? Number.NaN : Number(existing);
  if (!Number.isFinite(since)) {
    local?.setItem(CHECKOUT_NOT_FOUND_SINCE_KEY, String(now));
    return;
  }
  if (now - since >= CHECKOUT_ABANDON_MS) clearCheckoutStarted();
}
