"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createDefaultInvoice } from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/pdf";
import { computeTotals } from "@/lib/tax";
import {
  readDraftStore,
  readIsPro,
  upsertDraft,
  writeDraftStore,
} from "@/lib/storage";
import { PRO_UNLOCKED_EVENT, unlockProLocally } from "@/lib/pro";
import type { DraftStore, Invoice, PaywallReason } from "@/lib/types";

type InvoiceContextValue = {
  invoice: Invoice;
  setInvoice: (updater: Invoice | ((prev: Invoice) => Invoice)) => void;
  isPro: boolean;
  unlockPro: () => void;
  drafts: Invoice[];
  savedAt: number | null;
  saveNow: () => void;
  newDraft: () => boolean;
  loadDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  paywallOpen: boolean;
  paywallReason: PaywallReason;
  openPaywall: (reason: PaywallReason) => void;
  closePaywall: () => void;
  exportPdf: (element: HTMLElement) => Promise<void>;
  exporting: boolean;
  hydrated: boolean;
};

const InvoiceContext = createContext<InvoiceContextValue | null>(null);

export function InvoiceProvider({ children }: { children: React.ReactNode }) {
  const [invoice, setInvoiceState] = useState<Invoice>(createDefaultInvoice);
  const [store, setStore] = useState<DraftStore>({ v: 1, currentId: "", drafts: [] });
  const [isPro, setIsPro] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>("watermark");
  const [exporting, setExporting] = useState(false);
  const pdfCount = useRef(0);
  const skipSave = useRef(true);

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate drafts from localStorage after mount */
  useEffect(() => {
    const loaded = readDraftStore();
    const pro = readIsPro();
    const current = loaded.drafts.find((d) => d.id === loaded.currentId) ?? loaded.drafts[0];
    setIsPro(pro);
    setStore(loaded);
    if (current) {
      setInvoiceState(current);
      if (current.theme) {
        document.documentElement.setAttribute("data-theme", current.theme);
      }
    }
    setHydrated(true);
    writeDraftStore(loaded, pro);
    skipSave.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const onUnlock = () => {
      setIsPro(true);
      setPaywallOpen(false);
    };
    window.addEventListener(PRO_UNLOCKED_EVENT, onUnlock);
    return () => window.removeEventListener(PRO_UNLOCKED_EVENT, onUnlock);
  }, []);

  const persist = useCallback(
    (nextInvoice: Invoice, nextPro: boolean) => {
      setStore((prev) => {
        const next = upsertDraft(
          prev.drafts.length ? prev : { v: 1, currentId: nextInvoice.id, drafts: [nextInvoice] },
          nextInvoice,
        );
        writeDraftStore(next, nextPro);
        return next;
      });
      setSavedAt(Date.now());
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    const handle = window.setTimeout(() => persist(invoice, isPro), 400);
    return () => window.clearTimeout(handle);
  }, [invoice, isPro, hydrated, persist]);

  const setInvoice = useCallback((updater: Invoice | ((prev: Invoice) => Invoice)) => {
    setInvoiceState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next.theme && next.theme !== prev.theme) {
        document.documentElement.setAttribute("data-theme", next.theme);
      }
      return next;
    });
  }, []);

  const unlockPro = useCallback(() => {
    unlockProLocally();
  }, []);

  const saveNow = useCallback(() => persist(invoice, isPro), [invoice, isPro, persist]);

  const newDraft = useCallback(() => {
    if (!isPro) {
      const ok = window.confirm(
        "Free includes one draft on this device. Starting a new invoice replaces it. Continue?",
      );
      if (!ok) {
        setPaywallReason("drafts");
        setPaywallOpen(true);
        return false;
      }
      const created = createDefaultInvoice();
      created.id = invoice.id;
      created.theme = invoice.theme;
      created.templateId = invoice.templateId;
      skipSave.current = true;
      setInvoiceState(created);
      persist(created, false);
      return true;
    }
    const created = createDefaultInvoice();
    created.theme = invoice.theme;
    created.templateId = invoice.templateId;
    skipSave.current = true;
    setInvoiceState(created);
    persist(created, true);
    return true;
  }, [invoice.id, invoice.templateId, invoice.theme, isPro, persist]);

  const loadDraft = useCallback(
    (id: string) => {
      const found = store.drafts.find((draft) => draft.id === id);
      if (!found) return;
      skipSave.current = true;
      setInvoiceState(found);
      setStore((prev) => {
        const next = { ...prev, currentId: id };
        writeDraftStore(next, isPro);
        return next;
      });
    },
    [isPro, store.drafts],
  );

  const deleteDraft = useCallback(
    (id: string) => {
      if (!isPro) return;
      setStore((prev) => {
        const drafts = prev.drafts.filter((draft) => draft.id !== id);
        const fallback = drafts[0] ?? createDefaultInvoice();
        const nextDrafts = drafts.length > 0 ? drafts : [fallback];
        const currentId = prev.currentId === id ? nextDrafts[0].id : prev.currentId;
        const next = { v: 1 as const, currentId, drafts: nextDrafts };
        writeDraftStore(next, true);
        if (prev.currentId === id) {
          skipSave.current = true;
          setInvoiceState(nextDrafts[0]);
        }
        return next;
      });
    },
    [isPro],
  );

  const openPaywall = useCallback((reason: PaywallReason) => {
    setPaywallReason(reason);
    setPaywallOpen(true);
  }, []);

  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  const exportPdf = useCallback(
    async (element: HTMLElement) => {
      const totals = computeTotals(invoice);
      if (invoice.taxMode === "gst" && totals.gstIncomplete) {
        window.alert(
          "Set country to India and pick a state on both From and To before exporting a GST invoice.",
        );
        return;
      }
      setExporting(true);
      try {
        await downloadInvoicePdf(element, invoice);
        pdfCount.current += 1;
        if (!isPro && pdfCount.current >= 2) {
          setPaywallReason("pdf");
          setPaywallOpen(true);
        }
      } catch (error) {
        console.error(error);
        window.alert("Could not create the PDF. Try again from the Preview tab.");
      } finally {
        setExporting(false);
      }
    },
    [invoice, isPro],
  );

  const value = useMemo<InvoiceContextValue>(
    () => ({
      invoice,
      setInvoice,
      isPro,
      unlockPro,
      drafts: store.drafts,
      savedAt,
      saveNow,
      newDraft,
      loadDraft,
      deleteDraft,
      paywallOpen,
      paywallReason,
      openPaywall,
      closePaywall,
      exportPdf,
      exporting,
      hydrated,
    }),
    [
      closePaywall,
      deleteDraft,
      exportPdf,
      exporting,
      hydrated,
      invoice,
      isPro,
      loadDraft,
      newDraft,
      openPaywall,
      paywallOpen,
      paywallReason,
      saveNow,
      savedAt,
      setInvoice,
      store.drafts,
      unlockPro,
    ],
  );

  return <InvoiceContext.Provider value={value}>{children}</InvoiceContext.Provider>;
}

export function useInvoice() {
  const ctx = useContext(InvoiceContext);
  if (!ctx) throw new Error("useInvoice must be used within InvoiceProvider");
  return ctx;
}
