# Restoring a lost Pro install

Pro is stored on the subscription, as a list of install ids. The webhook adds the first id and does not add another. A buyer who clears this browser's data, or opens a new browser, keeps paying and loses Pro on that device.

The thanks page, the paywall, and `/pricing` tell them to email support with the Lemon Squeezy receipt when `NEXT_PUBLIC_SUPPORT_EMAIL` is set. That line is hidden when the variable is empty. Use the same address in the Lemon store's receipt settings.

There is no restore form in the app. Support adds the device by hand.

## Check the receipt first

1. Open the order in Lemon. Confirm the buyer email, that the order is paid, that it is not refunded, and that the variant is `2238873` or `2238798`.
2. Copy the Lemon order id (the order resource id). The sequential order number on the receipt is not the key this app stores.
3. Ask the buyer for the install id in this browser: `localStorage` key `invoice-install-v1`, 32 hex characters. An older UUID is not a valid install id. Attach the new 32-hex id. If a live subscription's only device is still a UUID from before that change, attach the buyer's new id the same way before they are left without Pro.

## Script

From a machine that has the Upstash env for that deployment:

```bash
VERCEL_ENV=production \
UPSTASH_REDIS_REST_URL=... \
UPSTASH_REDIS_REST_TOKEN=... \
node --experimental-strip-types scripts/attach-device.ts \
  --subscription <subscription id> \
  --install <32 hex install id> \
  --order <lemon order id>
```

`VERCEL_ENV` must be set (`production` or `preview`). The script refuses to run without it, so it cannot write `inv:local:` against the production database. It reads `inv:<VERCEL_ENV>:order:<order id>` and continues only when that key points at the subscription id you passed. It then appends the install id to `inv:<VERCEL_ENV>:sub:<subscription id>` (at most 3 devices), and writes that id's `user:` and `idx:` keys.

Run it once per device. If the install id is already on the subscription, the script leaves the list as it is and rewrites the pointer.

## When not to attach

If the subscription is refunded, the script stops and does not add a device. Refund through Lemon, or wait for a new charge. A later `subscription_payment_success` on that same subscription clears the refund and can turn Pro back on. Do not clear `refunded` by hand.

If the order id does not match the subscription, stop. Do not point the device at a different subscription to make the command succeed. If the buyer should not be charged, refund the order in Lemon. That is the fallback when the receipt does not match a subscription this app stored.
