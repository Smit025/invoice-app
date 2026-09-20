"use client";

import { CURRENCIES, LOCALES } from "@/lib/constants";
import { compressLogo, isAllowedLogoFile } from "@/lib/logo";
import { computeTotals, formatMoney } from "@/lib/format";
import type { Invoice } from "@/lib/types";
import { AddressFields } from "@/components/editor/AddressFields";
import { LineItemsEditor } from "@/components/editor/LineItemsEditor";
import { TaxSection } from "@/components/editor/TaxSection";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { useInvoice } from "@/components/editor/InvoiceStore";

export function InvoiceForm() {
  const { invoice, setInvoice, isPro, openPaywall, saveNow, savedAt } = useInvoice();
  const totals = computeTotals(invoice);

  const onLogo = (file: File | undefined) => {
    if (!isPro) {
      openPaywall("logo");
      return;
    }
    if (!file) {
      setInvoice({ ...invoice, logoDataUrl: undefined });
      return;
    }
    const typeError = isAllowedLogoFile(file);
    if (typeError) {
      window.alert(typeError);
      return;
    }
    void compressLogo(file)
      .then((logoDataUrl) => setInvoice((prev) => ({ ...prev, logoDataUrl })))
      .catch(() => window.alert("Could not read that logo. Try a smaller PNG, JPEG, or WebP."));
  };

  return (
    <form
      className="space-y-8 p-4 pb-24 lg:p-6 lg:pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        saveNow();
      }}
    >
      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">From</h2>
        <AddressFields
          idPrefix="from"
          includePhone
          value={invoice.from}
          onChange={(from) => setInvoice({ ...invoice, from })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">To</h2>
        <AddressFields
          idPrefix="to"
          value={invoice.to}
          onChange={(to) => setInvoice({ ...invoice, to })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">Invoice</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Invoice number" htmlFor="number">
            <Input
              id="number"
              value={invoice.number}
              onChange={(e) => setInvoice({ ...invoice, number: e.target.value })}
            />
          </Field>
          <Field label="Currency" htmlFor="currency">
            <Select
              id="currency"
              value={invoice.currency}
              onChange={(e) =>
                setInvoice({ ...invoice, currency: e.target.value as Invoice["currency"] })
              }
            >
              {CURRENCIES.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Issue date" htmlFor="issue">
            <Input
              id="issue"
              type="date"
              value={invoice.issueDate}
              onChange={(e) => setInvoice({ ...invoice, issueDate: e.target.value })}
            />
          </Field>
          <Field label="Due date" htmlFor="due">
            <Input
              id="due"
              type="date"
              value={invoice.dueDate}
              onChange={(e) => setInvoice({ ...invoice, dueDate: e.target.value })}
            />
          </Field>
          <Field label="Date format" htmlFor="locale">
            <Select
              id="locale"
              value={invoice.locale}
              onChange={(e) =>
                setInvoice({ ...invoice, locale: e.target.value as Invoice["locale"] })
              }
            >
              {LOCALES.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">Line items</h2>
        <LineItemsEditor invoice={invoice} onChange={setInvoice} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">Tax & totals</h2>
        <TaxSection invoice={invoice} onChange={setInvoice} />
        <dl className="space-y-1 rounded-lg bg-surface p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular">
              {formatMoney(totals.subtotal, invoice.currency, invoice.locale)}
            </dd>
          </div>
          {totals.tax > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">{totals.taxLabel}</dt>
              <dd className="tabular">{formatMoney(totals.tax, invoice.currency, invoice.locale)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(totals.total, invoice.currency, invoice.locale)}</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold leading-6">Notes & terms</h2>
        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            value={invoice.notes ?? ""}
            onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
            placeholder="Thank you for your business."
          />
        </Field>
        <Field label="Payment terms" htmlFor="terms">
          <Input
            id="terms"
            value={invoice.paymentTerms ?? ""}
            onChange={(e) => setInvoice({ ...invoice, paymentTerms: e.target.value })}
            placeholder="Net 14"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold leading-6">Branding</h2>
          {!isPro ? (
            <button
              type="button"
              className="text-xs font-medium text-accent"
              onClick={() => openPaywall("logo")}
            >
              Pro
            </button>
          ) : null}
        </div>
        <Field
          label="Logo"
          htmlFor="logo"
          hint={isPro ? "PNG, JPEG, or WebP. Max 2MB — stored compressed." : "Logo upload is a Pro feature."}
        >
          <Input
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!isPro}
            onClick={(e) => {
              if (!isPro) {
                e.preventDefault();
                openPaywall("logo");
              }
            }}
            onChange={(e) => onLogo(e.target.files?.[0])}
          />
        </Field>
        {invoice.logoDataUrl && isPro ? (
          <Button variant="ghost" onClick={() => setInvoice({ ...invoice, logoDataUrl: undefined })}>
            Remove logo
          </Button>
        ) : null}
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary">
          Save draft
        </Button>
        {savedAt ? (
          <span className="text-xs font-medium text-success">Saved</span>
        ) : (
          <span className="text-xs text-muted">Autosaves to this device</span>
        )}
      </div>
    </form>
  );
}
