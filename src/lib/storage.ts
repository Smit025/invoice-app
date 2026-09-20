import { DRAFT_KEY, PRO_KEY } from "./constants";
import { createDefaultInvoice, emptyAddress, emptyItem } from "./invoice";
import { clampNonNegative, clampTaxRate } from "./tax";
import type { Address, Currency, DraftStore, Invoice, LineItem, Locale, TaxMode, TemplateId, Theme } from "./types";

const CURRENCIES: Currency[] = ["USD", "EUR", "GBP", "INR"];
const LOCALES: Locale[] = ["en-US", "en-GB"];
const TAX_MODES: TaxMode[] = ["none", "sales_tax", "vat", "gst"];
const TEMPLATES: TemplateId[] = ["classic", "minimal", "bold"];
const THEMES: Theme[] = ["light", "dark"];

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function hydrateAddress(value: unknown, fallbackCountry: string): Address {
  const base = emptyAddress(fallbackCountry);
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  return {
    name: asString(record.name),
    address1: asString(record.address1),
    address2: asString(record.address2),
    city: asString(record.city),
    region: asString(record.region),
    postal: asString(record.postal),
    country: asString(record.country, fallbackCountry) || fallbackCountry,
    taxId: asString(record.taxId),
    email: asString(record.email),
    phone: asString(record.phone),
  };
}

function hydrateItem(value: unknown): LineItem {
  const base = emptyItem();
  if (!value || typeof value !== "object") return base;
  const record = value as Record<string, unknown>;
  return {
    id: asString(record.id, base.id),
    description: asString(record.description),
    qty: clampNonNegative(Number(record.qty)),
    rate: clampNonNegative(Number(record.rate)),
    amount: 0,
    hsn: asString(record.hsn),
  };
}

/** Merge a partial/corrupt object onto a full default invoice. Never throws on missing fields. */
export function hydrateInvoice(value: unknown): Invoice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const base = createDefaultInvoice();
  const items = Array.isArray(record.items) ? record.items.map(hydrateItem) : base.items;
  return {
    ...base,
    id: asString(record.id, base.id) || base.id,
    number: asString(record.number, base.number),
    issueDate: asString(record.issueDate, base.issueDate) || base.issueDate,
    dueDate: asString(record.dueDate, base.dueDate) || base.dueDate,
    locale: oneOf(record.locale, LOCALES, base.locale),
    currency: oneOf(record.currency, CURRENCIES, base.currency),
    from: hydrateAddress(record.from, "US"),
    to: hydrateAddress(record.to, "US"),
    items: items.length > 0 ? items : base.items,
    taxMode: oneOf(record.taxMode, TAX_MODES, base.taxMode),
    taxRate: clampTaxRate(Number(record.taxRate)),
    notes: asString(record.notes, base.notes ?? ""),
    paymentTerms: asString(record.paymentTerms, base.paymentTerms ?? ""),
    templateId: oneOf(record.templateId, TEMPLATES, base.templateId),
    logoDataUrl:
      typeof record.logoDataUrl === "string" && record.logoDataUrl.startsWith("data:image/")
        ? record.logoDataUrl
        : undefined,
    theme: oneOf(record.theme, THEMES, base.theme),
  };
}

export function emptyStore(): DraftStore {
  const invoice = createDefaultInvoice();
  return { v: 1, currentId: invoice.id, drafts: [invoice] };
}

function isDraftEnvelope(value: unknown): value is { v: unknown; currentId: unknown; drafts: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.v === 1 && Array.isArray(record.drafts);
}

export function parseDraftStore(raw: string | null): DraftStore {
  if (!raw) return emptyStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isDraftEnvelope(parsed)) {
      const drafts = parsed.drafts
        .map((draft) => hydrateInvoice(draft))
        .filter((draft): draft is Invoice => draft !== null);
      if (drafts.length === 0) return emptyStore();
      const currentId = asString(parsed.currentId);
      const current = drafts.find((draft) => draft.id === currentId) ?? drafts[0];
      return { v: 1, currentId: current.id, drafts };
    }
    const invoice = hydrateInvoice(parsed);
    if (invoice) return { v: 1, currentId: invoice.id, drafts: [invoice] };
  } catch {
    /* ignore corrupt storage */
  }
  return emptyStore();
}

export function readDraftStore(): DraftStore {
  if (typeof window === "undefined") return emptyStore();
  return parseDraftStore(window.localStorage.getItem(DRAFT_KEY));
}

function isQuotaExceeded(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { name?: string; code?: number };
  return record.name === "QuotaExceededError" || record.code === 22 || record.code === 1014;
}

function stripLogos(store: DraftStore): DraftStore {
  return {
    ...store,
    drafts: store.drafts.map((draft) => ({ ...draft, logoDataUrl: undefined })),
  };
}

export function writeDraftStore(store: DraftStore, isPro: boolean): void {
  if (typeof window === "undefined") return;
  const drafts = isPro
    ? store.drafts
    : store.drafts.filter((draft) => draft.id === store.currentId).slice(0, 1);
  const currentId = drafts.some((draft) => draft.id === store.currentId)
    ? store.currentId
    : drafts[0]?.id;
  const next: DraftStore = {
    v: 1,
    currentId: currentId ?? store.currentId,
    drafts: drafts.length > 0 ? drafts : store.drafts.slice(0, 1),
  };
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(stripLogos(next)));
    } catch {
      /* draft stays in memory for this session */
    }
  }
}

export function readIsPro(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PRO_KEY) === "1";
}

export function writeIsPro(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(PRO_KEY, "1");
    else window.localStorage.removeItem(PRO_KEY);
  } catch (error) {
    if (!isQuotaExceeded(error)) throw error;
  }
}

export function upsertDraft(store: DraftStore, invoice: Invoice): DraftStore {
  const index = store.drafts.findIndex((draft) => draft.id === invoice.id);
  const drafts = [...store.drafts];
  if (index === -1) drafts.unshift(invoice);
  else drafts[index] = invoice;
  return { v: 1, currentId: invoice.id, drafts };
}
