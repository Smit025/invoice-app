export const INSTALL_ID_KEY = "invoice-install-v1";
export const CHECKOUT_STARTED_KEY = "invoice-checkout-started-v1";

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
 * A stored UUID from the previous format is replaced once. Re-attach a paid
 * subscription with Restore purchase; the server does not accept the old id.
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

export function markCheckoutStarted(): void {
  sessionCheckoutStarted = true;
  storage()?.setItem(CHECKOUT_STARTED_KEY, "1");
}

export function hasCheckoutStarted(): boolean {
  if (sessionCheckoutStarted) return true;
  return storage()?.getItem(CHECKOUT_STARTED_KEY) === "1";
}
