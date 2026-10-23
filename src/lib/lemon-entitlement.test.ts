import { describe, expect, it } from "vitest";
import { MemoryEntitlementStore } from "./entitlement-store";
import { LEMON_VARIANT_IDS } from "./lemon-config";
import { persistLemonWebhook } from "./lemon-entitlement";

const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STORE = "123";
const NOW = new Date("2026-10-23T12:00:00.000Z");

function subscription(input: {
  event?: string;
  id?: string;
  webhookId: string;
  updatedAt: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  status?: string;
  variantId?: string | null;
  userId?: string;
  type?: string;
  subscriptionId?: string;
  userEmail?: string;
  orderId?: string;
}) {
  const attributes: Record<string, unknown> = {
    store_id: Number(STORE),
    status: input.status ?? "active",
    updated_at: input.updatedAt,
    currency: "USD",
    subtotal: input.variantId === LEMON_VARIANT_IDS.sixMonth ? 799 : 299,
  };
  if (input.variantId !== null) attributes.variant_id = Number(input.variantId ?? LEMON_VARIANT_IDS.monthly);
  if (input.renewsAt !== undefined) attributes.renews_at = input.renewsAt;
  else attributes.renews_at = "2026-12-01T00:00:00.000Z";
  if (input.endsAt !== undefined) attributes.ends_at = input.endsAt;
  if (input.subscriptionId) attributes.subscription_id = input.subscriptionId;
  if (input.userEmail) attributes.user_email = input.userEmail;
  if (input.orderId) attributes.order_id = input.orderId;
  return {
    meta: {
      event_name: input.event ?? "subscription_updated",
      webhook_id: input.webhookId,
      custom_data: { user_id: input.userId ?? USER },
    },
    data: {
      type: input.type ?? "subscriptions",
      id: input.id ?? "sub_race",
      attributes,
    },
  };
}

describe("atomic entitlement updates", () => {
  it("keeps the newer subscription when two events are applied together, in either order", async () => {
    const older = subscription({
      webhookId: "wh-old",
      updatedAt: "2026-10-01T00:00:00.000Z",
      renewsAt: "2026-11-01T00:00:00.000Z",
    });
    const newer = subscription({
      webhookId: "wh-new",
      updatedAt: "2026-10-02T00:00:00.000Z",
      renewsAt: "2026-12-01T00:00:00.000Z",
    });

    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      const store = new MemoryEntitlementStore();
      await Promise.all(order.map((payload) => persistLemonWebhook(payload, store, { storeId: STORE, now: NOW })));
      expect(await store.getBySubscriptionId("sub_race")).toMatchObject({
        renewsAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-10-02T00:00:00.000Z",
        active: true,
      });
    }
  });

  it("does not let a later inactive record hide an active subscription", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        id: "sub_live",
        webhookId: "wh-live",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_expired",
        id: "sub_old",
        webhookId: "wh-old-sub",
        updatedAt: "2026-10-20T00:00:00.000Z",
        renewsAt: null,
        endsAt: "2026-10-01T00:00:00.000Z",
        status: "expired",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      {
        meta: {
          event_name: "license_key_created",
          webhook_id: "wh-lic",
          custom_data: { user_id: USER },
        },
        data: {
          type: "license-keys",
          id: "lic_1",
          attributes: {
            store_id: Number(STORE),
            variant_id: Number(LEMON_VARIANT_IDS.monthly),
            status: "disabled",
            expires_at: "2026-09-01T00:00:00.000Z",
            updated_at: "2026-10-21T00:00:00.000Z",
          },
        },
      },
      store,
      { storeId: STORE, now: NOW },
    );

    expect(await store.getByUserId(USER)).toMatchObject({ subscriptionId: "sub_live", active: true });
  });

  it("keeps a refund in place when a later active update arrives", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        webhookId: "wh-created",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_payment_refunded",
        webhookId: "wh-refund",
        updatedAt: "2026-10-02T00:00:00.000Z",
        status: "refunded",
        renewsAt: null,
        endsAt: "2026-10-02T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    await persistLemonWebhook(
      subscription({
        event: "subscription_updated",
        webhookId: "wh-active-again",
        updatedAt: "2026-10-03T00:00:00.000Z",
        status: "active",
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );

    expect(await store.getBySubscriptionId("sub_race")).toMatchObject({ active: false, refunded: true });
  });

  it("resolves payment_success with no variant_id from the stored subscription", async () => {
    const store = new MemoryEntitlementStore();
    await persistLemonWebhook(
      subscription({
        event: "subscription_created",
        id: "sub_inv",
        webhookId: "wh-base",
        updatedAt: "2026-10-01T00:00:00.000Z",
        renewsAt: "2026-12-01T00:00:00.000Z",
        variantId: LEMON_VARIANT_IDS.monthly,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    const outcome = await persistLemonWebhook(
      subscription({
        event: "subscription_payment_success",
        type: "subscription-invoices",
        id: "inv_1",
        subscriptionId: "sub_inv",
        webhookId: "wh-invoice",
        updatedAt: "2026-10-15T00:00:00.000Z",
        status: "paid",
        variantId: null,
        renewsAt: "2027-01-01T00:00:00.000Z",
      }),
      store,
      { storeId: STORE, now: NOW },
    );

    expect(outcome).toMatchObject({ result: "applied", reason: "payment_success" });
    expect(await store.getBySubscriptionId("sub_inv")).toMatchObject({
      plan: "monthly",
      variantId: LEMON_VARIANT_IDS.monthly,
      active: true,
      renewsAt: "2027-01-01T00:00:00.000Z",
    });

    const missing = await persistLemonWebhook(
      subscription({
        event: "subscription_payment_success",
        type: "subscription-invoices",
        id: "inv_missing",
        subscriptionId: "sub_missing",
        webhookId: "wh-invoice-missing",
        updatedAt: "2026-10-15T00:00:00.000Z",
        status: "paid",
        variantId: null,
      }),
      store,
      { storeId: STORE, now: NOW },
    );
    expect(missing).toMatchObject({ result: "ignored", reason: "unknown_variant" });
    expect(await store.getBySubscriptionId("sub_missing")).toBeNull();
  });
});
