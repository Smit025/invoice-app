# InvoiceMaker

Client-only invoice generator for the US and Europe (VAT, sales tax, optional India GST). Next.js App Router, Tailwind CSS, TypeScript. No auth or database. Pro is a device-local flag (`invoice-pro-v1`) unlocked after Lemon Squeezy checkout and cleared when that subscription period ends.

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
| `/api/checkout` | `GET` capabilities · `POST` returns the live `/checkout/buy/` link. Does not create a Lemon cart. |
| `/api/webhooks/lemonsqueezy` | Signed Lemon webhook. Subscription events grant or end Pro. |

**Free:** full editor, three templates, PDF, watermark, one `localStorage` draft, no logo.  
**Pro:** no watermark, logo upload, unlimited local drafts.

Drafts are stored at `invoice-draft-v1`. Theme (light/dark) applies to chrome only; invoice paper stays light.

## Lemon Squeezy (Pro checkout)

Pro is a subscription. The paywall opens a **checkout overlay** via [Lemon.js](https://docs.lemonsqueezy.com/help/lemonjs/opening-overlays) on the live `/checkout/buy/` links:

- **$2.99/mo** — variant `2238873`
- **$7.99 every 6 months** — variant `2238798`

On `Checkout.Success` the app stores a device license in `localStorage.invoice-pro-v1` that expires at the end of that billing period (or sooner if Lemon includes `ends_at` / `renews_at`). There is no account.

The paywall does **not** call Lemon's checkouts API. That path was opening a test-mode `/checkout/cart/` overlay. `POST /api/checkout` only echoes the live buy link. `createLemonCheckout` still exists for a live key, and it refuses to create a cart unless the variant's `test_mode` is `false`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `LEMONSQUEEZY_CHECKOUT_URL` | 6-month buy link. Falls back to the live URL above. |
| `LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` | Monthly buy link. Falls back to the live URL above. |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | Optional alias of the 6-month URL. |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` | Optional alias of the monthly URL. |
| `NEXT_PUBLIC_CHECKOUT_URL` | Deprecated alias of the 6-month URL. |
| `LEMONSQUEEZY_API_KEY` | Live API key. Not used by the paywall. Test-mode keys cannot create carts. |
| `LEMONSQUEEZY_STORE_ID` | Store id from Lemon **Settings → Stores**. |
| `LEMONSQUEEZY_VARIANT_ID` | 6-month variant. Defaults to `2238798`. |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | Monthly variant. Defaults to `2238873`. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/lemonsqueezy`. |

Retired test buy link `c3c13987-5ccc-4a5c-b260-fd7eae12baca` and any `/checkout/cart/` or `/checkout/custom/` URL are ignored.

### Webhook

Point Lemon **Settings → Webhooks** (live mode) at `https://<your-domain>/api/webhooks/lemonsqueezy` and subscribe to:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_expired`
- `subscription_payment_success`

The route verifies `X-Signature` (HMAC-SHA256 of the raw body). Both variants (`2238873`, `2238798`) grant Pro. A cancelled subscription stays active until `ends_at`. `subscription_expired`, an `ends_at` in the past, or an expired/disabled license key sets Pro inactive. `order_created` is acknowledged and does not grant access. There is no user database, so the device enforces the period stored at checkout. The webhook response reports the license decision for that event.

### Demo vs production fallback

- **Live buy links** (the code defaults): **Unlock Pro — $2.99/mo** beside **Unlock Pro — $7.99 every 6 months**, plus **Continue free**.
- **Not configured + `NODE_ENV=development`**: **Unlock Pro (demo)**. Sets `invoice-pro-v1` locally.
- **Not configured + production**: **Payments coming soon**.

You can still force Pro in the browser console:

```js
localStorage.setItem("invoice-pro-v1", "1");
```

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command `npm run build`, output is the default Next.js output.
3. Set `LEMONSQUEEZY_CHECKOUT_URL` and `LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` to the live buy links (also the code defaults). Remove the retired test buy link if it is still set. Use a **live** API key if you set `LEMONSQUEEZY_API_KEY`.
4. After deploy, register the live webhook URL for the subscription events above.
5. The editor itself stays client-side; checkout and webhook routes are the only serverless endpoints.

## Stack notes

- PDF: `html2canvas` 1.4.1 + `jsPDF` 4.2.1 (exact versions, no caret). Export is a rasterized snapshot of the live invoice DOM (A4, 12mm content inset) — text is not selectable. Very long invoices paginate by slicing the bitmap; you may see minor clipping, scale quirks, or a second nearly-blank page. html2canvas also struggles with some CSS (oklch, off-screen nodes, cross-origin images).
- Tax is exclusive only. Rounding is half-up to 2 decimal places in order: line amounts → subtotal → tax → total. GST requires India + a state on both From and To; CGST+SGST is a remainder split of the same tax used for IGST. Rates are user-entered, not tax advice.
- Design source: Sofia’s Invoice Generator Design Pack v1.2.
