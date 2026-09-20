import { writeIsPro } from "./storage";

export const PRO_UNLOCKED_EVENT = "invoice-pro-unlocked";

export function unlockProLocally(): void {
  writeIsPro(true);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PRO_UNLOCKED_EVENT));
}
