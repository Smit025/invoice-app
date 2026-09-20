"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { Badge, SegmentedControl } from "@/components/ui/Controls";
import { InvoiceForm } from "@/components/editor/InvoiceForm";
import { InvoicePreview } from "@/components/editor/InvoicePreview";
import { PaywallModal } from "@/components/editor/PaywallModal";
import { TemplatePicker } from "@/components/editor/TemplatePicker";
import { useInvoice } from "@/components/editor/InvoiceStore";
import { cn } from "@/lib/cn";
import type { TemplateId, Theme } from "@/lib/types";

export function EditorApp() {
  const {
    invoice,
    setInvoice,
    isPro,
    openPaywall,
    exportPdf,
    exporting,
    drafts,
    loadDraft,
    newDraft,
    hydrated,
  } = useInvoice();
  const paperRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"form" | "preview">("form");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const appliedQuery = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect -- querystring is applied once after drafts hydrate */
  useEffect(() => {
    if (!hydrated || appliedQuery.current) return;
    const panel = searchParams.get("panel");
    const template = searchParams.get("template");
    const upgrade = searchParams.get("upgrade");
    if (template === "classic" || template === "minimal" || template === "bold") {
      setInvoice((prev) => ({ ...prev, templateId: template as TemplateId }));
    }
    if (panel === "templates") setTemplatesOpen(true);
    if (upgrade === "1") openPaywall("pricing");
    appliedQuery.current = true;
    if (panel || template || upgrade) router.replace(pathname);
  }, [hydrated, openPaywall, pathname, router, searchParams, setInvoice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onPdf = async () => {
    if (!paperRef.current) return;
    await exportPdf(paperRef.current);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-4 lg:px-6">
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {isPro && drafts.length > 0 ? (
            <label className="hidden sm:block">
              <span className="sr-only">Drafts</span>
              <select
                className="h-10 max-w-[140px] rounded-lg border border-border-strong bg-bg px-2 text-sm"
                value={invoice.id}
                onChange={(e) => loadDraft(e.target.value)}
              >
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.number || "Draft"} · {draft.to.name || "No client"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Button
              variant="ghost"
              className="hidden sm:inline-flex"
              onClick={() => openPaywall("drafts")}
            >
              Drafts
            </Button>
          )}
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => newDraft()}>
            New
          </Button>
          <Button variant="ghost" onClick={() => setTemplatesOpen(true)}>
            Templates
          </Button>
          <SegmentedControl
            ariaLabel="Theme"
            size="sm"
            value={invoice.theme}
            onChange={(theme: Theme) => setInvoice({ ...invoice, theme })}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <Button className="hidden lg:inline-flex" onClick={onPdf} disabled={exporting}>
            {exporting ? "Preparing…" : "Download PDF"}
          </Button>
          {!isPro ? (
            <Button variant="secondary" className="hidden lg:inline-flex" onClick={() => openPaywall("pricing")}>
              Upgrade
            </Button>
          ) : (
            <span className="hidden lg:inline-flex">
              <Badge tone="accent">Pro</Badge>
            </span>
          )}
        </div>
      </header>

      <div className="flex border-b border-border lg:hidden">
        {(["form", "preview"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-11 flex-1 text-sm font-medium",
              tab === id ? "border-b-2 border-accent text-accent" : "text-muted",
            )}
          >
            {id === "form" ? "Form" : "Preview"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "w-full overflow-y-auto border-r border-border lg:max-w-[480px] lg:basis-[44%]",
            tab !== "form" && "hidden lg:block",
          )}
        >
          {hydrated ? <InvoiceForm /> : <p className="p-6 text-sm text-muted">Restoring draft…</p>}
        </div>
        <div className={cn("relative min-w-0 flex-1", tab !== "preview" && "hidden lg:block")}>
          {hydrated ? <InvoicePreview paperRef={paperRef} /> : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-20 flex gap-2 border-t border-border bg-bg p-3 lg:hidden">
        <Button className="h-11 min-h-11 flex-1" onClick={onPdf} disabled={exporting}>
          {exporting ? "Preparing…" : "Download PDF"}
        </Button>
        {!isPro ? (
          <Button
            variant="secondary"
            className="h-11 min-h-11 flex-1"
            onClick={() => openPaywall("pricing")}
          >
            Upgrade
          </Button>
        ) : (
          <Button variant="secondary" className="h-11 min-h-11 flex-1" onClick={() => newDraft()}>
            New draft
          </Button>
        )}
      </div>

      <TemplatePicker open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <PaywallModal />
    </div>
  );
}
