"use client";

import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/Button";
import { InvoiceDocument } from "@/components/templates/InvoiceDocument";
import { Badge } from "@/components/ui/Controls";
import { PRICING, PRODUCT_NAME, TEMPLATES } from "@/lib/constants";
import { sampleInvoice } from "@/lib/invoice";
import type { TemplateId } from "@/lib/types";

const HERO_PROOF_CHIPS = ["Tax on free", "No signup", "USD · EUR · GBP", "3 templates"] as const;

function MiniInvoice({ templateId }: { templateId: TemplateId }) {
  return (
    <div className="h-[240px] overflow-hidden bg-[#ffffff]">
      <div style={{ transform: "scale(0.30)", transformOrigin: "top center" }}>
        <InvoiceDocument invoice={sampleInvoice(templateId)} showWatermark={false} />
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark />
          <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
            <a href="#templates" className="hover:text-text">
              Templates
            </a>
            <a href="#pricing" className="hover:text-text">
              Pricing
            </a>
            <Link href="/app" className="font-medium text-text">
              Create invoice
            </Link>
          </nav>
          <Link href="/app" className="sm:hidden">
            <Button>Create</Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="mb-3 text-xs font-medium leading-4 tracking-[0.06em] text-muted">
              Free invoice maker · EU + US
            </p>
            <h1 className="text-[36px] font-semibold leading-[44px] tracking-tight sm:text-5xl sm:leading-[56px]">
              Free invoices with VAT & sales tax — USD, EUR, or GBP
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-6 text-muted">
              Built for EU and US freelancers. Create a clean PDF in minutes — no signup. Upgrade
              to Pro when you want your logo and drafts without the watermark.
            </p>
            <div className="mt-6 flex justify-center">
              <Link href="/app">
                <Button className="h-11 px-5">Create invoice</Button>
              </Link>
            </div>
            <ul className="mt-5 flex flex-wrap justify-center gap-2">
              {HERO_PROOF_CHIPS.map((chip) => (
                <li key={chip}>
                  <Badge>{chip}</Badge>
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="ml-2 text-xs text-muted">Editor · live A4 preview</span>
            </div>
            <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="space-y-3 border-b border-border p-4 md:border-b-0 md:border-r">
                <div className="h-3 w-16 rounded bg-surface-2" />
                <div className="h-10 rounded-lg bg-bg ring-1 ring-border-strong" />
                <div className="h-10 rounded-lg bg-bg ring-1 ring-border-strong" />
                <div className="h-24 rounded-lg bg-bg ring-1 ring-border-strong" />
                <div className="flex gap-2">
                  <span className="h-8 w-16 rounded-md bg-accent-subtle" />
                  <span className="h-8 w-20 rounded-md bg-surface-2" />
                </div>
              </div>
              <div className="flex justify-center bg-surface p-4">
                <div className="w-full max-w-sm overflow-hidden rounded-lg bg-[#ffffff] shadow-[0_0_0_1px_var(--border)]">
                  <MiniInvoice templateId="classic" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="templates" className="border-t border-border bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-[28px] font-semibold leading-9">Three templates. One accent.</h2>
            <p className="mt-2 max-w-xl text-sm leading-5 text-muted">
              Classic, Minimal, and Bold — international Stripe/Linear look, not a government
              form. All three are free.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {TEMPLATES.map((template) => (
                <Link
                  key={template.id}
                  href={`/app?template=${template.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-bg transition-colors duration-150 hover:border-border-strong"
                >
                  <MiniInvoice templateId={template.id} />
                  <div className="p-4">
                    <p className="font-semibold">{template.name}</p>
                    <p className="mt-1 text-sm text-muted">{template.blurb}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-[28px] font-semibold leading-9">Everything you need to bill</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Live A4 preview",
                body: "The PDF matches what you see. Split editor on desktop, tabs on mobile.",
              },
              {
                title: "VAT, sales tax & GST",
                body: "Exclusive tax only. US sales tax, EU VAT, and India GST with CGST/SGST vs IGST.",
              },
              {
                title: "PDF in one click",
                body: "Client-side export. Filename uses your invoice number and client name.",
              },
              {
                title: "Dark mode chrome",
                body: "Light or dark editor. Printed paper always stays light.",
              },
              {
                title: "Works on your phone",
                body: "Mobile-first form, 44px sticky PDF bar, accessible labels and focus rings.",
              },
              {
                title: "No account required",
                body: "Drafts live in your browser. One free draft, unlimited with Pro.",
              },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border border-border p-5">
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-5 text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="border-t border-border bg-surface py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-[28px] font-semibold leading-9">Free vs Pro</h2>
            <p className="mt-2 text-sm text-muted">
              {`USD. Pro is $${PRICING.oneTime} one-time via Lemon Squeezy, or $${PRICING.monthly}/mo.`}
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-bg p-6">
                <p className="text-sm font-medium text-muted">Free</p>
                <p className="mt-2 text-[36px] font-semibold leading-[44px]">$0</p>
                <ul className="mt-4 space-y-2 text-sm leading-5 text-muted">
                  <li>Full editor + live preview + PDF</li>
                  <li>Watermark on preview and PDF</li>
                  <li>1 draft on this device</li>
                  <li>All 3 templates</li>
                  <li>No logo upload</li>
                </ul>
                <Link href="/app" className="mt-6 inline-block">
                  <Button variant="secondary">Start free</Button>
                </Link>
              </div>
              <div className="rounded-xl border border-accent bg-bg p-6">
                <p className="text-sm font-medium text-accent">Pro</p>
                <p className="mt-2 text-[36px] font-semibold leading-[44px]">
                  ${PRICING.oneTime}
                </p>
                <p className="text-sm text-muted">one-time, or ${PRICING.monthly}/mo</p>
                <ul className="mt-4 space-y-2 text-sm leading-5 text-muted">
                  <li>No watermark on preview or PDF</li>
                  <li>Logo on every invoice</li>
                  <li>Unlimited local drafts</li>
                </ul>
                <Link href="/app?upgrade=1" className="mt-6 inline-block">
                  <Button>Unlock Pro — ${PRICING.oneTime}</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            {PRODUCT_NAME} — free invoice generator for VAT invoices, sales tax, and GST.
          </p>
          <div className="flex gap-4">
            <Link href="/app">Create invoice</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/thanks">Thanks</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
