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
| `/api/entitlement` | `GET` with header `X-Install-Id`. Returns `active`, `inactive`, or `not_found`. |
| `/api/webhooks/lemonsqueezy` | Signed Lemon webhook. Writes the entitlement store. |

**Free:** full editor, three templates, PDF, watermark, one `localStorage` draft, no logo.  
**Pro:** no watermark, logo upload, unlimited local drafts.

Drafts are stored at `invoice-draft-v1`. Theme (light/dark) applies to chrome only; invoice paper stays light.

## Lemon Squeezy (Pro checkout)

Pro is a subscription. The paywall opens a **checkout overlay** via [Lemon.js](https://docs.lemonsqueezy.com/help/lemonjs/opening-overlays) on the live `/checkout/buy/` links:

- **$2.99/mo** — variant `2238873` — `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/bd2f2883-79ba-47ec-8610-3287ee80846b?enabled=2238873`
- **$7.99 every 6 months** — variant `2238798` — `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/f1ffee5b-5cbe-4c44-ba12-1ec93b520ca2?enabled=2238798`

The browser generates an anonymous install id (`invoice-install-v1`): 16 bytes from `crypto.getRandomValues`, hex encoded (32 characters). It is sent to Lemon as `checkout[custom][user_id]` and back on `meta.custom_data.user_id`. The app sends it to `GET /api/entitlement` in the `X-Install-Id` header (or a POST body), never in the query string. A different id, or an older UUID, gets `not_found` and does not touch Redis. A stored UUID is replaced once in the browser.

Ownership is the subscription id, not the install id. The record holds a device list. The webhook's `user_id` is added only when that list is empty. A later event that carries a different `user_id` still updates the subscription, and it does not add or remove a device. Another browser is not attached in this release. See [docs/RESTORE_FOLLOWUP.md](docs/RESTORE_FOLLOWUP.md).

Access ends at the stored `ends_at`, or at `renews_at` when `ends_at` is empty. The browser does not start its own expiry timer, and a checkout success event does not grant Pro. If several records exist for one install, the active subscription wins over a later inactive record or a license key.

The entitlement request is cached in `localStorage` for 15 minutes and the response sends `Cache-Control: private, max-age=900`. Fast polling (every 5 seconds, for at most 3 minutes, and it stops once Pro is active) runs only on `/thanks` and right after checkout. Every other page skips the API until checkout has started or a cached `active` or `inactive` entitlement exists, then refreshes when that cache is older than 15 minutes (including when the tab is focused). A cached `not_found` by itself does not keep polling. Checkout stores a timestamp in `invoice-checkout-started-v1`. After 24 hours of continuous `not_found`, that flag is cleared. An install that never started checkout and has no remembered entitlement makes no entitlement requests.

Each cached read is two Redis commands (`GET` the install pointer, then `GET` the subscription), at most once per 15 minutes. 640 commands a month is about 320 reads, about 2.7 hours a day. A subscriber with the editor open 8 hours a day is about 1,900 commands a month. The post-checkout burst is about 72 commands, once. Each webhook `EVAL` runs about 12 commands inside the script, roughly 30 a month. Against the free 500,000 commands, that is about 250 subscribers at the heavy end and about 780 at the light end. An install that never starts checkout costs 0 commands. Do not add a card to the Upstash account; a card switches it to pay-as-you-go.

`/api/entitlement` also rate limits in process memory (48 requests per 3 minutes per install id, 120 per minute per IP). That limiter does not use Redis, and it is per serverless instance, so it is not a global cap. A store error returns 500 and does not grant Pro. The browser keeps a cached active snapshot for 15 minutes after that, and only if the server had already confirmed it.

Vercel Firewall rate limiting is included on the Hobby plan: one rule per project, fixed window only, a window from 10 seconds to 10 minutes, a key of IP or JA4, and 1,000,000 allowed requests a month. Denied requests do not count toward that included amount, and Hobby cannot buy overage. Publish one rule in the Vercel Firewall dashboard (do not add a paid product):

- If the path starts with `/api/entitlement`
- Fixed window, 30 requests per 60 seconds, key IP, action 429

Vercel counts that limit per region, so the 30 requests per 60 seconds cap applies separately in each region. The rule is free on Hobby. Leave it off only if you do not want the cap. Do not enable rate-limit overage. There is no `vercel.json` firewall entry in this repo; the dashboard is what publishes the included rule. The in-memory limiter stays as a second layer.

Both plans renew automatically until cancelled. Cancel from the link in the receipt email. Pro stays active until the end of the paid period.

The paywall does **not** call Lemon's checkouts API. Only the two live buy links above are used. Any other `/checkout/buy/` URL, including a test-mode link, is ignored.

### Environment variables Susmit needs to set

Public URLs use `NEXT_PUBLIC_` names. Secrets stay server-only.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL` | Optional. Accepted only when it is the live 6-month buy link above. |
| `NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY` | Optional. Accepted only when it is the live monthly buy link above. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Optional. Shown on `/thanks`, the paywall, and `/pricing` so a buyer can email that address with their Lemon Squeezy receipt if Pro disappears. The line is hidden when this is unset. |
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

The variant is taken from `attributes.variant_id` or `first_order_item.variant_id`. Custom checkout data cannot choose the variant. When a price and currency are present they must be USD 299 (monthly) or USD 799 (6-month); they are not used to guess the plan. If those amount fields are absent, the price check passes. That is only a secondary check after the variant is known. `subscription_payment_success` may omit `variant_id` (subscription invoices do). The plan is taken from the stored subscription. `meta.test_mode: true` is applied only when `VERCEL_ENV` is `preview`. `NODE_ENV` does not allow it. `attributes.store_id` must equal `LEMONSQUEEZY_STORE_ID`.

A cancelled subscription stays active until `ends_at`. `subscription_expired`, a passed `ends_at`, or an expired/disabled license key clears Pro. `subscription_payment_failed`, `past_due`, and `unpaid` do not move the paid-through date later. Pause turns Pro off without extending the period. Resume and unpause turn it back on when that date is still ahead. A refund clears Pro immediately. A later `subscription_updated` on that same subscription stores the new period and leaves Pro off. A following `subscription_payment_success` clears the refund and turns Pro back on from those dates, including when the update arrives before the invoice and the invoice has no dates of its own. A refund of one subscription does not block a later purchase that has a different subscription id. `order_created` does not grant access.

`order_refunded` often has no `subscription_id`. The webhook stores `order id → subscription id` when an event carries a valid order id, and a refund looks the subscription up from that key. Lemon order payloads have no `subscription_id`. If the order id is present and not mapped yet, the event is ignored. It does not revoke the install's best subscription.

`updated_at` on the stored record comes only from Lemon (`updated_at`, else `created_at`). Nothing writes the request clock into that field. When Lemon omits both, the previous stamp stays, or `0` when the subscription is new.

Equal `updated_at` values are ties (Lemon's timestamp is second precision). The winner is deterministic. Higher status precedence wins: refunded, then expired or a disabled license, then any other revoke, then pause or a payment that must not extend the period, then a grant. If precedence also ties, the lexicographically greater `meta.webhook_id` wins.

The duplicate check, the subscription read, the tie-break, and the key writes run in one Redis `EVAL`. Redis does not roll a script back when it errors. The script returns normally after it claims the event. If the HTTP call itself fails, the event key is deleted so Lemon's retry can run. Duplicate `meta.webhook_id` values are skipped. An older `updated_at` is skipped.

Redis keys are prefixed with `inv:<VERCEL_ENV>:` (`production`, `preview`, or `development`). Outside production, an unset `VERCEL_ENV` uses `inv:local:`. Production with Upstash credentials and an empty `VERCEL_ENV` returns 503 instead of that prefix. A test-mode purchase on a preview deployment cannot write the production keys. `meta.test_mode: true` is still applied only when `VERCEL_ENV` is `preview`. Production without the Upstash env vars still returns 503. `NODE_ENV` does not allow test mode, and it does not choose the prefix.

### Restore purchase

Not in this release. The plan for a later pull request is [docs/RESTORE_FOLLOWUP.md](docs/RESTORE_FOLLOWUP.md): a one-time code to the order email or the unguessable receipt id, adding a device instead of moving the subscription, a global rate limit, and a subscription lookup by `order_id`.

Until then, `/thanks`, the paywall, and `/pricing` point at `NEXT_PUBLIC_SUPPORT_EMAIL` when it is set. The manual steps, including the refund fallback, are in [docs/SUPPORT.md](docs/SUPPORT.md). `scripts/attach-device.ts` appends one install id after the stored order id matches the subscription.

### Demo vs production fallback

- **Live buy links** (the code defaults): **Unlock Pro — $2.99/mo** beside **Unlock Pro — $7.99 every 6 months**, plus **Continue free**.
- **Not configured + `NODE_ENV=development`**: **Unlock Pro (demo)**.
- **Not configured + production**: **Payments coming soon**. The live links are the defaults, so production shows the two buttons.

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js**. Build command `npm run build`, output is the default Next.js output.
3. Set `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`. Use the free Upstash tier. The two live buy links are already the code defaults. Vercel sets `VERCEL_ENV`; do not add a separate variable for the Redis prefix. The Hobby firewall rule above is optional and free. Do not turn on a paid rate-limit overage.
4. After deploy, register the live webhook URL for the subscription events above.
5. The editor itself stays client-side. Entitlement and webhook routes are the serverless endpoints.

## Stack notes

- PDF: `html2canvas` 1.4.1 + `jsPDF` 4.2.1 (exact versions, no caret). Export is a rasterized snapshot of the live invoice DOM (A4, 12mm content inset) — text is not selectable. Very long invoices paginate by slicing the bitmap; you may see minor clipping, scale quirks, or a second nearly-blank page. html2canvas also struggles with some CSS (oklch, off-screen nodes, cross-origin images).
- Tax is exclusive only. Rounding is half-up to 2 decimal places in order: line amounts → subtotal → tax → total. GST requires India + a state on both From and To; CGST+SGST is a remainder split of the same tax used for IGST. Rates are user-entered, not tax advice.
- Design source: Sofia’s Invoice Generator Design Pack v1.2.
