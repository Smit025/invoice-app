# Restore purchase (follow-up)

Restore purchase is not in this release. The thanks page does not ask for an email or an order number, and there is no `/api/entitlement/restore` route.

A later pull request can attach another browser only with proof that the buyer controls the purchase. The subscription record already keeps a device list. The signed webhook adds the first install id and never replaces it.

1. **Buyer-only proof.** Send a one-time code to the order email, or accept the unguessable receipt id. Check that id against Lemon's order. Do not accept the sequential order number plus the email address typed into a form.
2. **Add a device.** Append the current install id to the subscription's device list (cap it at 2–3). Do not move the subscription off the browser that already has it, and do not drop the earlier devices.
3. **A global rate limit.** Count restore attempts in one place (the Vercel Firewall rule, or one Redis counter). A limit that lives in the memory of each serverless instance is not enough.
4. **Look the subscription up by order id.** A Lemon order has no `subscription_id`. Load `GET /v1/subscriptions?filter[order_id]=` (or the order's subscriptions relationship). The fixture for that test has to match a real order payload, not a made-up `subscription_id`.

This release already stores `order id → subscription id` from the signed webhook, and `order_refunded` uses that map. The follow-up should use the same subscription id, then add a device.
