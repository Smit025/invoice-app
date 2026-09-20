# InvoiceMaker

Client-only invoice generator for the US and Europe (VAT, sales tax, optional India GST). Next.js App Router, Tailwind CSS, TypeScript. No auth or database. Pro is a device-local flag (`invoice-pro-v1`) unlocked after Lemon Squeezy checkout.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run test    # tax rounding / GST split / Lemon webhook + checkout helpers
npm run lint
npm run build   # production build
npm run start   # serve the production build
```

Copy `.env.example` to `.env.local` and paste Lemon Squeezy values when you have them. **Do not commit secrets.**

## Product

| Route | What it is |
| --- | --- |
| `/` | Landing — hero, templates, features, Free vs Pro |
| `/app` | Editor — form + live A4 preview, PDF export |
| `/app?panel=templates` | Opens the template picker |
| `/app?template=classic` | Starts (or switches) that template |
| `/pricing` | Free vs Pro + Lemon checkout CTAs |
| `/thanks` | Post-checkout landing (`?pro=1` unlocks Pro on this device) |
| `/api/checkout` | `GET` capabilities · `POST` creates a Lemon checkout when API keys are set |
| `/api/webhooks/lemonsqueezy` | Signed Lemon webhook (logs entitlement events; no server unlock yet) |

**Free:** full editor, three templates, PDF, watermark, one `localStorage` draft, no logo.  
**Pro:** no watermark, logo upload, unlimited local drafts.

Drafts are stored at `invoice-draft-v1`. Theme (light/dark) applies to chrome only; invoice paper stays light.

## Lemon Squeezy (Pro checkout)

The paywall prefers a **checkout overlay** via [Lemon.js](https://docs.lemonsqueezy.com/help/lemonjs/opening-overlays). On `Checkout.Success` the app sets `localStorage.invoice-pro-v1 = "1"` and shows a toast. That is the MVP entitlement path (no accounts).

### Environment variables

Public (safe to expose; used by the browser):

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | One-time **$48** overlay / share URL. Defaults in code to the live Pro buy link so production works before Vercel env is set. Override here if needed. |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` | Optional monthly overlay URL. Shows a secondary CTA only when set — not marketed as cheaper than $48 one-time. |
| `NEXT_PUBLIC_CHECKOUT_URL` | Deprecated alias for the one-time URL. |

Server-only (never prefix with `NEXT_PUBLIC_`):

| Variable | Purpose |
| --- | --- |
| `LEMONSQUEEZY_API_KEY` | API key for `POST /api/checkout`. |
| `LEMONSQUEEZY_STORE_ID` | Store id from Lemon **Settings → Stores**. |
| `LEMONSQUEEZY_VARIANT_ID` | One-time Pro variant id. |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | Optional monthly variant id. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/lemonsqueezy`. |

If the public checkout URL is set (or the built-in $48 default is used), the client opens it with Lemon.js and **does not** need the API key. Variant-based checkout is a fallback: when API key + store + variant ids are present, `POST /api/checkout` `{ "plan": "onetime" \| "monthly" }` creates a checkout and returns `{ "url" }` for the overlay.

### Webhook (future server entitlement)

Point Lemon **Settings → Webhooks** at `https://<your-domain>/api/webhooks/lemonsqueezy`. The route verifies `X-Signature` (HMAC-SHA256 of the raw body). On `order_created` and `license_key_created` it logs a short summary and returns **200**. It does **not** unlock Pro on the server — there is no user store yet. Client unlock stays on Lemon.js `Checkout.Success` (and `/thanks?pro=1` after a hosted redirect).

### Demo vs production fallback

- **Lemon configured** (public URL or API checkout): primary **Unlock Pro — $48**, optional monthly button if that URL/variant is set, **Continue free**. No demo button.
- **Not configured + `NODE_ENV=development`** (`next dev`): **Unlock Pro — $48 (demo)** with a demo-mode label. Sets `invoice-pro-v1` locally.
- **Not configured + production** (`next build` / Vercel): **Payments coming soon**.

You can still force Pro in the browser console:

```js
localStorage.setItem("invoice-pro-v1", "1");
```

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command `npm run build`, output is the default Next.js output.
3. Overlay checkout works without env vars (the $48 buy URL is the code default). Optionally set `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` to override, plus server keys for the webhook / API checkout.
4. After deploy, register the webhook URL in Lemon Squeezy if you want signed `order_created` logs.
5. The editor itself stays client-side; checkout and webhook routes are the only serverless endpoints.

## Stack notes

- PDF: `html2canvas` 1.4.1 + `jsPDF` 4.2.1 (exact versions, no caret). Export is a rasterized snapshot of the live invoice DOM (A4, 12mm content inset) — text is not selectable. Very long invoices paginate by slicing the bitmap; you may see minor clipping, scale quirks, or a second nearly-blank page. html2canvas also struggles with some CSS (oklch, off-screen nodes, cross-origin images).
- Tax is exclusive only. Rounding is half-up to 2 decimal places in order: line amounts → subtotal → tax → total. GST requires India + a state on both From and To; CGST+SGST is a remainder split of the same tax used for IGST. Rates are user-entered, not tax advice.
- Design source: Sofia’s Invoice Generator Design Pack v1.2.
