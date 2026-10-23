# InvoiceMaker

Client-only invoice generator for the US and Europe (VAT, sales tax, optional India GST). Next.js App Router, Tailwind CSS, TypeScript. Drafts stay in the browser. Pro is a Lemon Squeezy subscription: the webhook writes it to a server store, and this browser polls that store. There is no account.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run test    # tax rounding / GST split / Lemon webhook + entitlement
npm run lint
npm run build   # production build
npm run start   # serve the production build
```

Copy `.env.example` to `.env.local` and paste Lemon Squeezy values when you have them. **Do not commit secrets.**

Without Redis credentials, `npm run dev` keeps entitlement state in memory for the dev process. Production refuses webhooks until the store env vars below are set.

## Product

| Route | What it is |
| --- | --- |
| `/` | Landing — hero, templates, features, Free vs Pro |
| `/app` | Editor — form + live A4 preview, PDF export |
| `/app?panel=templates` | Opens the template picker |
| `/app?template=classic` | Starts (or switches) that template |
| `/pricing` | Free vs the two Pro plans, plus Lemon checkout |
| `/thanks` | Post-checkout page. It does not unlock Pro. |
| `/api/entitlement` | `GET ?user_id=` returns `active`, `inactive`, or `not_found` |
| `/api/webhooks/lemonsqueezy` | Signed Lemon webhook. Writes the entitlement store. |

**Free:** full editor, three templates, PDF, watermark, one `localStorage` draft, no logo.  
**Pro:** no watermark, logo upload, unlimited local drafts.

Drafts are stored at `invoice-draft-v1`. Theme (light/dark) applies to chrome only; invoice paper stays light.

## Lemon Squeezy (Pro checkout)

Pro is a subscription. The paywall opens a **checkout overlay** via [Lemon.js](https://docs.lemonsqueezy.com/help/lemonjs/opening-overlays) on the live `/checkout/buy/` links:

- **$2.99/mo** — variant `2238873` — `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/bd2f2883-79ba-47ec-8610-3287ee80846b?enabled=2238873`
- **$7.99 every 6 months** — variant `2238798` — `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/f1ffee5b-5cbe-4c44-ba12-1ec93b520ca2?enabled=2238798`

The browser generates an anonymous install id (`invoice-install-v1`) and appends it as `checkout[custom][user_id]`. Lemon sends that id back on `meta.custom_data.user_id`. The webhook stores the subscription against that id. The app polls `GET /api/entitlement?user_id=`. A different id gets `not_found`.

Access ends at the stored `ends_at`, or at `renews_at` when `ends_at` is empty. The browser does not start its own expiry timer, and a checkout success event does not grant Pro.

Both plans renew automatically until cancelled. Cancel from the link in the receipt email. Pro stays active until the end of the paid period.

The paywall does **not** call Lemon's checkouts API. Only the two live buy links above are used. Any other `/checkout/buy/` URL, including a test-mode link, is ignored.

### Environment variables Susmit needs to set

Public URLs use `NEXT_PUBLIC_` names. Secrets stay server-only.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | Optional. Accepted only when it is the live 6-month buy link above. |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` | Optional. Accepted only when it is the live monthly buy link above. |
| `LEMONSQUEEZY_STORE_ID` | Store id from Lemon **Settings → Stores**. Required in production. The webhook rejects events whose `store_id` does not match. |
| `LEMONSQUEEZY_VARIANT_ID` | 6-month variant. Defaults to `2238798`. |
| `LEMONSQUEEZY_VARIANT_ID_MONTHLY` | Monthly variant. Defaults to `2238873`. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Signing secret for `POST /api/webhooks/lemonsqueezy`. |
| `UPSTASH_REDIS_REST_URL` | Free Upstash Redis REST URL. Required in production. |
| `UPSTASH_REDIS_REST_TOKEN` | Free Upstash Redis REST token. Required in production. |

`KV_REST_API_URL` and `KV_REST_API_TOKEN` are accepted as aliases of the Upstash pair. Do not point these at a paid database.

Retired test buy link `c3c13987-5ccc-4a5c-b260-fd7eae12baca` and any `/checkout/cart/` or `/checkout/custom/` URL are ignored.

### What to create

1. In Vercel, add the **Upstash Redis** integration and choose the **free** tier. Do not enable a paid plan. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into the project env.
2. Set `LEMONSQUEEZY_STORE_ID` and `LEMONSQUEEZY_WEBHOOK_SECRET` in the same place.
3. Leave the checkout URL vars unset unless you are restating the two live links exactly.

Local development without those Redis vars uses an in-memory store that disappears when the process stops. `localStorage` value `"1"` under `invoice-pro-v1` unlocks Pro only when `NODE_ENV` is `development` (the demo button). It does nothing in production.

### Webhook

Point Lemon **Settings → Webhooks** (live mode) at `https://<your-domain>/api/webhooks/lemonsqueezy` and subscribe to:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_refunded`
- `subscription_resumed`
- `subscription_paused`
- `subscription_unpaused`
- `order_refunded`

The route reads the raw body with `request.text()`, then checks `X-Signature` (HMAC-SHA256 hex, length check, `timingSafeEqual`) before `JSON.parse`. A missing secret returns 503. A bad signature returns 400. A handled event returns `{ ok: true }`.

The variant is taken from `attributes.variant_id` or `first_order_item.variant_id`. Custom checkout data cannot choose the variant. When a price and currency are present they must be USD 299 (monthly) or USD 799 (6-month); they are not used to guess the plan. `meta.test_mode: true` is ignored in production. `attributes.store_id` must equal `LEMONSQUEEZY_STORE_ID`.

A cancelled subscription stays active until `ends_at`. `subscription_expired`, a passed `ends_at`, or an expired/disabled license key clears Pro. `subscription_payment_failed`, `past_due`, and `unpaid` do not move the paid-through date later. Pause turns Pro off without extending the period. Resume and unpause turn it back on when that date is still ahead. A refund clears Pro immediately. `order_created` does not grant access.

Duplicate `meta.webhook_id` values are skipped. An event whose `updated_at` is older than the stored subscription is skipped.

### Demo vs production fallback

- **Live buy links** (the code defaults): **Unlock Pro — $2.99/mo** beside **Unlock Pro — $7.99 every 6 months**, plus **Continue free**.
- **Not configured + `NODE_ENV=development`**: **Unlock Pro (demo)**.
- **Not configured + production**: **Payments coming soon**. The live links are the defaults, so production shows the two buttons.

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command `npm run build`, output is the default Next.js output.
3. Set `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Use the free Upstash tier. The two live buy links are already the code defaults.
4. After deploy, register the live webhook URL for the subscription events above.
5. The editor itself stays client-side. Entitlement and webhook routes are the serverless endpoints.

## Stack notes

- PDF: `html2canvas` 1.4.1 + `jsPDF` 4.2.1 (exact versions, no caret). Export is a rasterized snapshot of the live invoice DOM (A4, 12mm content inset) — text is not selectable. Very long invoices paginate by slicing the bitmap; you may see minor clipping, scale quirks, or a second nearly-blank page. html2canvas also struggles with some CSS (oklch, off-screen nodes, cross-origin images).
- Tax is exclusive only. Rounding is half-up to 2 decimal places in order: line amounts → subtotal → tax → total. GST requires India + a state on both From and To; CGST+SGST is a remainder split of the same tax used for IGST. Rates are user-entered, not tax advice.
- Design source: Sofia’s Invoice Generator Design Pack v1.2.
