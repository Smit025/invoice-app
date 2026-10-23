export const INSTALL_ID_KEY = "invoice-install-v1";

const INSTALL_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isInstallUserId(value: string | null | undefined): value is string {
  return typeof value === "string" && INSTALL_ID_PATTERN.test(value.trim());
}

let sessionInstallId: string | undefined;

/** Opaque per-browser id passed to Lemon as `checkout[custom][user_id]`. */
export function getOrCreateInstallId(): string {
  if (typeof window === "undefined") {
    throw new Error("install id is only available in the browser");
  }
  try {
    const existing = window.localStorage.getItem(INSTALL_ID_KEY);
    if (isInstallUserId(existing)) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(INSTALL_ID_KEY, created);
    return created;
  } catch {
    if (!sessionInstallId || !isInstallUserId(sessionInstallId)) {
      sessionInstallId = crypto.randomUUID();
    }
    return sessionInstallId;
  }
}
