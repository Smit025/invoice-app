import { writeIsPro } from "./storage";

export const PRO_UNLOCKED_EVENT = "invoice-pro-unlocked";

/** Development-only demo flag. Production Pro comes from the entitlement endpoint. */
export function unlockProLocally(): void {
  writeIsPro(true);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRO_UNLOCKED_EVENT));
}
