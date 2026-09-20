# Code review: PR #1 — InvoiceMaker MVP

**Reviewer:** Reed (senior)  
**Scope:** Read-only. Head `c017e42` / merge `4e7924d7d714e8e1a4a629a63b7da52b270c1a36`.  
**Bar:** EU + US client-only invoice MVP (Next.js App Router, Tailwind, TypeScript). Tax math is a ship gate.  
**Tests:** `npm test` — 8/8 passed (`src/lib/tax.test.ts`). No GitHub checks on the PR branch.

---

## Verdict: REQUEST_CHANGES

Do not merge until GST split identity, intra-state detection, and a few client-side safety/PDF-consistency holes are fixed. VAT / sales-tax exclusive half-up math is in good shape; GST is not.

This is not **BLOCK**: notes/PDF are not an XSS sink today, Pro-as-localStorage is an explicit stub, and the US/EU exclusive-tax path matches the spec on the cases that matter.

---

## Critical

None that are exploitable as written. GST paisa identity is **High**, not Critical, because India GST is secondary to EU+US — but it is still wrong often enough that you must not call the GST path “correct” in UI/README until it is fixed.

---

## High

### 1. GST: CGST + SGST frequently ≠ IGST (1 paisa)

**Path:** `src/lib/tax.ts` (`computeTotals` intra-state branch), `src/lib/tax.test.ts`

Intra-state independently rounds each half:

```ts
const half = rate / 2;
const cgst = roundHalfUp((subtotal * half) / 100);
const sgst = roundHalfUp((subtotal * half) / 100);
const tax = roundHalfUp(cgst + sgst);
```

Inter-state rounds the full rate once. `2 * round(x/2)` is not `round(x)`.

Verified against this implementation (not theory):

| Rate | Subtotal | CGST+SGST | IGST |
| --- | --- | --- | --- |
| 5% | 33.33 | 1.66 (0.83+0.83) | 1.67 |
| 5% | 123.45 | 6.18 | 6.17 |
| 18% | 18.52 | 3.34 | 3.33 |
| 18% | 100.03 | 18.00 | 18.01 |
| 28% | 123.45 | 34.56 | 34.57 |

For GST 18% on subtotals ₹100.00–₹1000.00, **45 000 / 90 001** amounts diverge by ₹0.01. Tests only cover ₹1000 @ 18% (both sides 180.00), so they never catch this.

**Fix:** Compute the full-rate tax once, then split with a remainder so the identity always holds:

```ts
const igst = roundHalfUp((subtotal * rate) / 100);
if (intraState) {
  const cgst = roundHalfUp(igst / 2);
  const sgst = roundHalfUp(igst - cgst); // == igst - cgst at 2dp
  return { tax: igst, cgst, sgst, igst: 0, taxLabel: "GST", intraState: true, ... };
}
```

Add a property test: for GST rates `[5,12,18,28]` and subtotals `0.01 … N`, intra `tax ===` inter `tax`, and `cgst + sgst === tax`.

Also label union territories as **UTGST** not SGST (`src/lib/countries.ts` `IN_STATES` includes AN, CH, DL, LD, PY, …). Optional for MVP if you document “SGST/UTGST combined as SGST”.

---

### 2. GST place-of-supply is a string compare, and empty states are treated as intra-state

**Path:** `src/lib/tax.ts` `isIntraState`, `src/components/editor/AddressFields.tsx`, `src/components/editor/TaxSection.tsx`

```ts
if (!from && !to) return true; // both blank → CGST+SGST
return from === to;
```

Issues:

- Blank From/To state (new invoice, GST selected) → **CGST+SGST**. Confirmed: empty IN addresses @ 18% on 100 → `cgst: 9`, `taxLabel: "GST"`.
- `"MH"` vs `"Maharashtra"` → **IGST**. Dropdowns store `region.name`, but there is no code/alias map.
- Country is ignored. US→US with the same state name in GST mode still splits CGST/SGST. IN→GB with empty GB region is inter-state (OK-ish) but IN→IN with no states is intra (not OK).

**Fix:**

- For `taxMode === "gst"`, require `from.country === "IN" && to.country === "IN"`.
- Compare `IN_STATES` **codes**, not display names (store `region.code` in the select `value`).
- If either state is missing, do not guess: keep IGST **or** block PDF with “Select From/To state for GST”. Never treat blank=blank as intra-state.
- Show a warning in `TaxSection` when states are incomplete.

---

### 3. PDF capture is not the invoice the user is looking at

**Path:** `src/components/editor/InvoicePreview.tsx`

Visible preview uses `sampleInvoice(...)` until the user types a name or a line item. The off-screen node that `exportPdf` captures always uses the **real** (often empty) `invoice`.

A first-run user on `/app` sees a polished Northline Studio sample and can hit **Download PDF**. The file is a blank INV-0001.

**Fix:** Either (a) bind `paperRef` to the same document that is on screen, or (b) disable PDF until `invoiceHasLiveData(invoice)`, or (c) never substitute sample data in the editor preview (landing minis are enough). Prefer (b)+(c).

---

### 4. Pro unlock is `localStorage["invoice-pro-v1"] === "1"` (plus an in-app demo button)

**Path:** `src/lib/storage.ts` `readIsPro` / `writeIsPro`, `src/components/editor/PaywallModal.tsx`, `src/components/editor/InvoiceStore.tsx`, `README.md`, `/thanks`

This matches the PR’s “stub” language. It is still a **High** product/security issue if this merge is what you deploy as a paid EU/US app:

- Watermark, logo, and extra drafts are not authorization; they are a CSS flag.
- The paywall’s **Unlock Pro (demo)** is a one-click bypass next to the fake Lemon Squeezy CTA.
- Free PDF after 2 exports only *nags*; it does not stop export (`pdfCount` in `InvoiceStore`).

**Fix (MVP-honest):** Keep the stub, but (1) hide the demo button behind `?demo=1` or `NODE_ENV !== "production"`, (2) do not imply checkout works, (3) when Lemon Squeezy lands, replace this with a signed entitlement (even a checkout success token written once). Do not treat this flag as a control you can charge for.

---

### 5. Logo upload: `image/*` → data URL → `<img src>` → localStorage, no MIME allowlist

**Path:** `src/components/editor/InvoiceForm.tsx` `onLogo`, `src/components/templates/shared.tsx` `Logo`

```ts
accept="image/*"
reader.readAsDataURL(file)
// ...
<img src={src} alt="Business logo" />
```

- SVG (and HTML-in-disguise) is allowed. Script in SVG-as-`<img>` is usually inert in current Chromium/Firefox/Safari, and PDF is a raster, so this is not a stored-XSS today. It is the wrong default for an invoice logo and for html2canvas’s SVG path.
- 2 MB file ≈ 2.7 MB data URL. `writeDraftStore` has no `try/catch`; `QuotaExceededError` will fail autosave unhandled.
- `parseDraftStore` will happily persist a remote `https://…` `logoDataUrl` if someone edits storage (tracking pixel on every preview).

**Fix:** Allowlist `image/png` and `image/jpeg` (optional `image/webp`). Reject SVG. Cap data URL length (~200–300 KB after resize/compress to max 512px). `try/catch` `setItem` and surface “Draft too large — remove logo”. When hydrating, only accept `data:image/png|jpeg`.

---

## Medium

### 6. Draft hydration is not an `Invoice`

**Path:** `src/lib/storage.ts` `isInvoiceLike` / `isDraftStore`, `src/components/editor/InvoiceStore.tsx`

`isInvoiceLike` only checks `id` and `number` are strings. `drafts` is `Array.isArray` with no element checks. A corrupt or malicious `invoice-draft-v1` will throw on `invoice.from.name` after hydrate and white-screen the editor.

**Fix:** Zod (or a narrow parser) with defaults from `createDefaultInvoice()`. Drop unknown keys. Never pass raw `JSON.parse` into React state.

---

### 7. `taxMode` fallback is GST; rates/qty are unclamped

**Path:** `src/lib/tax.ts`, `src/components/editor/TaxSection.tsx`, `src/components/editor/LineItemsEditor.tsx`

- Unknown `taxMode` (corrupt storage) falls through to the GST branch. Confirmed: `taxMode: "foo"`, rate 18 → CGST/SGST.
- HTML `max={100}` / `min={0}` is not enforced in `computeTotals`. `taxRate: 200` → tax 200; `taxRate: -5` → total 95; empty/`NaN` becomes 0 via `Number(...) || 0`.
- Qty/rate `Number(e.target.value)` accepts negatives despite `min={0}`.

**Fix:** `switch` with a default `none`. Clamp `taxRate` to `[0, 100]`, `qty`/`rate` to `>= 0`. Prefer `Number.parseFloat` + `Number.isFinite`.

---

### 8. Invoices print country **codes** (`US`, `DE`, `GB`)

**Path:** `src/lib/format.ts` `formatAddressLines`, `src/components/templates/shared.tsx` `PartyBlock`

`party.country` is an ISO code from the select. EU/US clients will not accept “DE” on a VAT invoice. Map `COUNTRIES` code → name (and consider “United States” vs “USA” as a later i18n choice).

---

### 9. Modal/Sheet a11y (EU EAA / WCAG)

**Path:** `src/components/ui/Modal.tsx`

Escape and backdrop click work. Missing: focus trap, initial focus, restore focus, `document.body` scroll lock, `aria-labelledby` always set (Sheet uses `aria-label` only). Segmented tax control is a `radiogroup` but is not arrow-key operable.

Landing copy claims “accessible labels and focus rings”; focus rings exist, dialog pattern does not meet the bar.

---

### 10. Architecture: PDF via html2canvas + jsPDF JPEG

**Path:** `src/lib/pdf.ts`, `next.config.ts` `transpilePackages`

- Output is a photograph of the DOM: not selectable, not extractable for bookkeeping, blurry small type, multi-page slices can cut rows.
- Hidden 794px clone + `getComputedStyle` on every node is fragile (ok-ish for MVP).
- `html2canvas` is a maintenance risk next to a money document.

Acceptable for an MVP stub if you document “image PDF”. Plan `@react-pdf/renderer` or a print stylesheet (`window.print()` + `@page A4`) before charging Pro.

Also: `InvoiceDocument` is mounted twice (scaled preview + off-screen capture). One source of truth would have avoided High #3.

---

### 11. TypeScript / App Router gaps

**Path:** `src/app/layout.tsx`, `src/lib/types.ts`, `src/components/editor/InvoiceForm.tsx`

- `LayoutProps<"/">` is a generated Next 16 type. `npx tsc --noEmit` fails with `TS2304: Cannot find name 'LayoutProps'` until `.next/types` exists. Prefer `React.PropsWithChildren` or run typecheck via `next build`.
- `Invoice.cgst` / `sgst` / `igst` on the document model are unused (totals live on `TaxBreakdown` only) — confusion waiting to happen.
- Form `as Invoice["currency"]` / `as Invoice["locale"]` casts skip validation.
- `strict` is on; `noUncheckedIndexedAccess` is not. `allowJs` is unnecessary.

App Router itself is used reasonably: server `layout` + metadata, editor `robots: noindex`, client island behind `Suspense` for `useSearchParams`, theme boot script with `suppressHydrationWarning`. Missing `metadataBase` for OG. `/app` as the product route is slightly confusing next to `src/app` but fine.

Landing is a `"use client"` page that mounts four full `InvoiceDocument` trees (plus paywall/template picker). Split the mini preview so the marketing page stays a server component.

---

### 12. Tailwind / chrome

**Path:** `src/app/globals.css`, `src/lib/cn.ts`

Token theme via `@theme inline` + `data-theme` and forced-light `.invoice-paper` is the right model (invoice must stay white in dark chrome). `cn()` is a boolean join, not `tailwind-merge` — conflicting utilities will not override. Touch targets: sticky PDF bar is `h-11`; most `Button`s are `h-10` (40px), below the 44px claim.

---

### 13. Checkout URL is an unvalidated `href`

**Path:** `src/lib/constants.ts` `CHECKOUT_URL`, `src/components/editor/PaywallModal.tsx`

`NEXT_PUBLIC_CHECKOUT_URL` is interpolated into `<a href>`. Restrict to `https:`.

---

### 14. Deps

`npm audit`: **2 moderate**, both **vitest / `@vitest/mocker` path traversal** (GHSA-82fw-gwwq-j7x9). Dev-only, not a production XSS. Pin/upgrade when convenient; do not `audit fix --force` to vitest 5 without reading the changelog.

No production advisories on `next@16.3.5`, `html2canvas@1.4.1`, `jspdf@4.2.1` in this install. html2canvas remains a supply-chain/quality concern (see #10).

---

## Low

- `deleteDraft` is implemented and exported from context but has **no UI**.
- `EU_VAT_COUNTRIES` is only used for address labels, not to suggest a VAT rate or to validate VAT IDs.
- GST form sidebar (`InvoiceForm` totals `dl`) shows a single `taxLabel` (“GST” / “IGST”); the paper shows CGST+SGST. Match them.
- Switching VAT→GST keeps `taxRate: 20` (not a GST slab). Reset or snap to `[0,5,12,18,28]`.
- `PartyBlock` keys address lines by text (`key={line}`) — duplicate lines collide.
- Notes/`whitespace-pre-wrap` has no `overflow-wrap: anywhere`; a long token can blow the 55% column and the PDF.
- `dueStatus` uses `T23:59:59` local — DST last-day edge cases.
- No `error.tsx` / error boundary around the editor.
- Theme boot `JSON.parse`s the whole draft store on every page (including landing) to read `theme`.
- Tests do not cover `formatMoney`, storage parse, or PDF filename sanitization (`src/lib/format.ts` `pdfFilename` is fine at a glance).

---

## Tax verification (ran `npm test` + extra probes)

**Spec:** exclusive only; `none | sales_tax | vat | gst`; half-up 2dp; order **lines → subtotal → tax → total**; GST CGST+SGST vs IGST by From/To state; currencies USD/EUR/GBP/INR.

| Rule | Result |
| --- | --- |
| Exclusive tax | Pass. Tax = round(subtotal × rate / 100), then total = round(subtotal + tax). No inclusive path. |
| `none` | Pass. `tax === 0`, `total === subtotal`. Rate ignored when mode is none **or** rate is 0. |
| `sales_tax` 8.875% of 100 | Pass. 8.88 / 108.88 (NYC-style 3dp rate). |
| `vat` 20% of 80 | Pass. 16 / 96. |
| Rounding order | Pass. Two × 10.555 → lines 10.56, 10.56 → subtotal 21.12 → VAT 4.22 → total 25.34. |
| Half-up 2dp | Pass for the famous IEEE case: `roundHalfUp(1.005) === 1.01` ( `Number(1.005.toFixed(2)) === 1` ). Bias `±1e-8` is documented in `tax.ts`. |
| GST intra ₹1000 @ 18% | Pass (only because it is a round number). |
| GST inter ₹1000 @ 18% | Pass; label `IGST`. |
| GST identity CGST+SGST vs IGST | **Fail** — see High #1. |
| Intra-state detection | **Fail** on blank/alias/country — see High #2. |
| Currencies | Pass. Math is currency-agnostic. `formatMoney` forces 2 fraction digits via `Intl`. USD/EUR/GBP/INR are all 2-decimal. Do not add JPY/KRW without changing this. |
| VAT 19/20/21 and sales 7.25/8.875 on 2dp subtotals vs integer cents | Pass: 0 mismatches over 1…200.00. |

**Integer / cents analysis**

- Internal model is IEEE-754 `number`, not integer minor units.
- For **2dp qty × 2dp rate** (the editor’s `step="0.01"`), `lineAmount` matched `round(qtyHundredths * rateCents / 100)` over a dense grid (integer qty 1–20 × rates 0.01–200.00: **0 mismatches**; sampled 2dp qty 0.01–100.00: **0 mismatches**).
- Tax-on-already-rounded-subtotal also matched `Math.round(subtotalCents * rate / 100)` for the VAT/sales rates above.
- So the 1e-8 `Math.round` helper is **adequate for current 2dp money**, and better than `toFixed(2)` on `.xxx5`.
- It is still the wrong long-term model: one future 3dp qty, a `rate` stored as 1.005, or a refactor that taxes unrounded floats will pick up paisa errors. Store **integer cents** (or a decimal type) from the input boundary:

```ts
const lineCents = Math.round(qtyHundredths * rateCents / 100);
const taxCents = Math.round(subtotalCents * rateBp / 10_000); // rate in basis points, 8.875% → 887.5 needs milli-bps
```

For 3dp sales-tax rates, use milli-basis-points (8875 for 8.875%) so the multiply stays integer.

`roundHalfUp` maps `NaN`/`Infinity` → 0 (good). Negatives half-up-away-from-zero (`-1.005` → `-1.01`) — clamp them at the form instead.

**Missing tests to add before merge:** GST identity property; blank states not intra; `MH` vs `Maharashtra`; unknown `taxMode`; negative qty; `taxRate` 200 / `-5`; 8.875% of 19.99 (1.77 / 21.76 — verified here).

---

## What’s solid

- Clear module split: `tax.ts` is pure and shared by form, paper, and tests — no parallel tax logic in templates.
- Exclusive half-up pipeline for **VAT and US sales tax** matches the written spec, including 3dp rates and line-then-subtotal ordering.
- `strict` TypeScript, App Router metadata, editor `noindex`, Inter + CSS variables, invoice paper forced light.
- Templates (Classic / Minimal / Bold) share `LineTable` / `Totals` / `Notes` — the right abstraction.
- Notes and payment terms are **React text nodes** (`{invoice.notes}`), not `dangerouslySetInnerHTML`. Combined with a raster PDF, that is the correct XSS posture; do not “upgrade” notes to Markdown HTML without a sanitizer.
- Theme boot script is a static string (not user-controlled HTML). JSON-LD on `/` is a static object.
- Autosave debounce, one-draft free cap in `writeDraftStore`, watermark stripped from logo when free (`logoSrc` gated on `showWatermark`).
- Country list and US/IN state dropdowns are a good start for EU+US+optional IN.
- README is honest about stub billing and client-only storage.

---

## Merge bar (minimum)

1. GST: remainder split so CGST+SGST === IGST; property tests.  
2. `isIntraState` uses IN + state **codes**; blank ≠ intra.  
3. PDF exports the visible invoice (or is disabled on sample).  
4. Logo MIME allowlist + storage quota handling.  
5. Harden `parseDraftStore`; unknown `taxMode` → `none`; clamp rates.  
6. Print country names, not codes.

Pro-as-localStorage may remain if it stays labeled a demo stub and the demo unlock is not on the production paywall.
