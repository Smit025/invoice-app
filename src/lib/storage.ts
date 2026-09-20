import { DRAFT_KEY, PRO_KEY } from "./constants";
import { createDefaultInvoice } from "./invoice";
import type { DraftStore, Invoice } from "./types";

function isInvoiceLike(value: unknown): value is Invoice {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.number === "string";
}

function isDraftStore(value: unknown): value is DraftStore {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.v === 1 && typeof record.currentId === "string" && Array.isArray(record.drafts);
}

export function emptyStore(): DraftStore {
  const invoice = createDefaultInvoice();
  return { v: 1, currentId: invoice.id, drafts: [invoice] };
}

export function parseDraftStore(raw: string | null): DraftStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isDraftStore(parsed) && parsed.drafts.length > 0) {
      const current =
        parsed.drafts.find((draft) => draft.id === parsed.currentId) ?? parsed.drafts[0];
      return { v: 1, currentId: current.id, drafts: parsed.drafts };
    }
    if (isInvoiceLike(parsed)) {
      return { v: 1, currentId: parsed.id, drafts: [parsed] };
    }
  } catch {
    /* ignore corrupt storage */
  }
  return emptyStore();
}

export function readDraftStore(): DraftStore {
  if (typeof window === "undefined") return emptyStore();
  return parseDraftStore(window.localStorage.getItem(DRAFT_KEY));
}

export function writeDraftStore(store: DraftStore, isPro: boolean): void {
  if (typeof window === "undefined") return;
  const drafts = isPro ? store.drafts : store.drafts.filter((draft) => draft.id === store.currentId).slice(0, 1);
  const currentId = drafts.some((draft) => draft.id === store.currentId)
    ? store.currentId
    : drafts[0]?.id;
  const next: DraftStore = {
    v: 1,
    currentId: currentId ?? store.currentId,
    drafts: drafts.length > 0 ? drafts : store.drafts.slice(0, 1),
  };
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
}

export function readIsPro(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PRO_KEY) === "1";
}

export function writeIsPro(value: boolean): void {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(PRO_KEY, "1");
  else window.localStorage.removeItem(PRO_KEY);
}

export function upsertDraft(store: DraftStore, invoice: Invoice): DraftStore {
  const index = store.drafts.findIndex((draft) => draft.id === invoice.id);
  const drafts = [...store.drafts];
  if (index === -1) drafts.unshift(invoice);
  else drafts[index] = invoice;
  return { v: 1, currentId: invoice.id, drafts };
}
