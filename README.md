# InvoiceMaker

Client-only invoice generator for the US and Europe (VAT, sales tax, optional India GST). Next.js App Router, Tailwind CSS, TypeScript. No backend, auth, or database.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run test    # tax rounding / GST split
npm run build   # production build
npm run start   # serve the production build
```

## Product

| Route | What it is |
| --- | --- |
| `/` | Landing — hero, templates, features, Free vs Pro |
| `/app` | Editor — form + live A4 preview, PDF export |
| `/app?panel=templates` | Opens the template picker |
| `/app?template=classic` | Starts (or switches) that template |
| `/pricing` | Free vs Pro |
| `/thanks` | Post-checkout stub for Lemon Squeezy later |

**Free:** full editor, three templates, PDF, watermark, one `localStorage` draft, no logo.  
**Pro stub:** no watermark, logo upload, unlimited local drafts.

Unlock Pro in the paywall with **Unlock Pro (demo)**, or in the browser console:

```js
localStorage.setItem("invoice-pro-v1", "1");
```

Drafts are stored at `invoice-draft-v1`. Theme (light/dark) applies to chrome only; invoice paper stays light.

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command `npm run build`, output is the default Next.js output. No environment variables are required.
3. Optional: set `NEXT_PUBLIC_CHECKOUT_URL` to a Lemon Squeezy checkout link when you are ready. Until then the paywall uses a placeholder.
4. Deploy. The app is static/client-side besides Next.js hosting — no database or serverless functions are required for the MVP.

## Stack notes

- PDF: `html2canvas` + `jsPDF` from the live invoice DOM (A4, 12mm content inset).
- Tax is exclusive only. Rounding is half-up to 2 decimal places in order: line amounts → subtotal → tax → total. GST splits CGST+SGST vs IGST from From/To state.
- Design source: Sofia’s Invoice Generator Design Pack v1.2.
