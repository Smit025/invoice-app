import { describe, expect, it } from "vitest";
import { LEMON_VARIANT_IDS } from "./lemon-config";
import { resolveLemonLicense } from "./lemon-license";

const NOW = new Date("2026-10-23T00:00:00.000Z");
const FUTURE = "2026-11-23T00:00:00.000Z";
const PAST = "2026-10-01T00:00:00.000Z";
const USER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const STORE = "123";

function subscription(
  event: string,
  variantId: string,
  attributes: Record<string, unknown> = {},
  meta: Record<string, unknown> = {},
) {
  return {
    meta: { event_name: event, custom_data: { user_id: USER }, ...meta },
    data: {
      type: "subscriptions",
      id: "sub_1",
      attributes: {
        store_id: Number(STORE),
        variant_id: Number(variantId),
        status: "active",
        renews_at: FUTURE,
        ends_at: null,
        updated_at: NOW.toISOString(),
        currency: "USD",
        subtotal: variantId === LEMON_VARIANT_IDS.monthly ? 299 : 799,
        ...attributes,
      },
    },
  };
}

function decide(payload: unknown, extra?: { allowTestMode?: boolean; storeId?: string }) {
  return resolveLemonLicense(payload, {
    now: NOW,
    storeId: extra?.storeId ?? STORE,
    allowTestMode: extra?.allowTestMode ?? false,
  });
}

describe("subscription license decisions", () => {
  it.each([
    ["monthly", LEMON_VARIANT_IDS.monthly],
    ["sixMonth", LEMON_VARIANT_IDS.sixMonth],
  ] as const)("grants an active %s subscription and revokes it when it expires", (plan, variantId) => {
    expect(decide(subscription("subscription_created", variantId)).action).toBe("grant");
    expect(decide(subscription("subscription_created", variantId))).toMatchObject({
      active: true,
      plan,
      variantId,
      userId: USER,
    });

    expect(
      decide(subscription("subscription_cancelled", variantId, { status: "cancelled", ends_at: FUTURE })),
    ).toMatchObject({
      action: "grant",
      active: true,
      endsAt: FUTURE,
      renewsAt: null,
      reason: "cancelled_until_period_end",
    });

    expect(
      decide(subscription("subscription_expired", variantId, { status: "expired", ends_at: PAST })),
    ).toMatchObject({ action: "revoke", active: false, reason: "expired" });
  });

  it("does not identify a plan from price alone or from custom data", () => {
    expect(
      decide({
        meta: {
          event_name: "subscription_payment_success",
          custom_data: { user_id: USER, variant_id: LEMON_VARIANT_IDS.sixMonth },
        },
        data: {
          type: "subscription-invoices",
          id: "inv_9",
          attributes: {
            store_id: Number(STORE),
            subscription_id: 9,
            subtotal: 799,
            currency: "USD",
            status: "paid",
          },
        },
      }),
    ).toMatchObject({
      action: "grant",
      reason: "payment_success",
      plan: null,
      variantId: null,
      subjectId: "9",
    });
  });

  it("rejects a mismatched currency or amount when the variant is known", () => {
    expect(
      decide(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, { currency: "EUR", subtotal: 299 }))
        .reason,
    ).toBe("price_mismatch");
    expect(
      decide(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, { currency: "USD", subtotal: 799 }))
        .reason,
    ).toBe("price_mismatch");
  });

  it("does not grant an unknown variant, a permanent order, or the wrong store", () => {
    expect(decide(subscription("subscription_created", "999")).action).toBe("ignore");
    expect(
      decide({
        meta: { event_name: "order_created", custom_data: { variant_id: LEMON_VARIANT_IDS.sixMonth } },
        data: {
          type: "orders",
          id: "ord_1",
          attributes: {
            store_id: Number(STORE),
            first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) },
            status: "paid",
          },
        },
      }),
    ).toMatchObject({ action: "ignore", reason: "not_a_license_event" });
    expect(decide(subscription("subscription_created", LEMON_VARIANT_IDS.monthly), { storeId: "999" }).reason).toBe(
      "store_mismatch",
    );
  });

  it("keeps a cancelled subscription only until ends_at", () => {
    expect(
      decide(subscription("subscription_cancelled", LEMON_VARIANT_IDS.monthly, { status: "cancelled", ends_at: PAST })),
    ).toMatchObject({ action: "revoke", active: false });
  });

  it("does not extend access for payment failure or past_due", () => {
    expect(decide(subscription("subscription_payment_failed", LEMON_VARIANT_IDS.monthly, { status: "paid" }))).toMatchObject(
      { action: "no_extend", reason: "payment_failed", dateMode: "keep" },
    );
    expect(
      decide(subscription("subscription_updated", LEMON_VARIANT_IDS.monthly, { status: "past_due", renews_at: "2027-01-01T00:00:00.000Z" })),
    ).toMatchObject({ action: "no_extend", reason: "past_due", dateMode: "keep" });
    expect(
      decide(subscription("subscription_updated", LEMON_VARIANT_IDS.sixMonth, { status: "unpaid" })),
    ).toMatchObject({ action: "no_extend", reason: "unpaid" });
  });

  it("maps pause, resume, unpause, and refunds", () => {
    expect(decide(subscription("subscription_paused", LEMON_VARIANT_IDS.monthly, { status: "paused" })).action).toBe(
      "pause",
    );
    expect(decide(subscription("subscription_resumed", LEMON_VARIANT_IDS.monthly, { status: "active" }))).toMatchObject({
      action: "grant",
      reason: "resumed",
    });
    expect(decide(subscription("subscription_unpaused", LEMON_VARIANT_IDS.sixMonth, { status: "active" })).reason).toBe(
      "unpaused",
    );
    expect(decide(subscription("subscription_payment_refunded", LEMON_VARIANT_IDS.monthly)).reason).toBe("refunded");
    expect(
      decide({
        meta: { event_name: "order_refunded", custom_data: { user_id: USER } },
        data: {
          type: "orders",
          id: "ord_9",
          attributes: {
            store_id: Number(STORE),
            subscription_id: "sub_1",
            currency: "USD",
            subtotal: 799,
            first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) },
            updated_at: NOW.toISOString(),
          },
        },
      }),
    ).toMatchObject({ action: "revoke", reason: "refunded", plan: "sixMonth" });
  });

  it("accepts test mode only when preview allows it, and ignores a license variant that only lives in custom data", () => {
    expect(
      decide(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, {}, { test_mode: true })).reason,
    ).toBe("test_mode");
    expect(
      decide(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, {}, { test_mode: true }), {
        allowTestMode: true,
      }).action,
    ).toBe("grant");
    expect(
      resolveLemonLicense(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, {}, { test_mode: true }), {
        now: NOW,
        storeId: STORE,
        env: { VERCEL_ENV: "preview" },
      }).action,
    ).toBe("grant");
    expect(
      resolveLemonLicense(subscription("subscription_created", LEMON_VARIANT_IDS.monthly, {}, { test_mode: true }), {
        now: NOW,
        storeId: STORE,
        env: { VERCEL_ENV: "production", NODE_ENV: "production" },
      }).reason,
    ).toBe("test_mode");

    expect(
      decide({
        meta: { event_name: "license_key_updated", custom_data: { variant_id: LEMON_VARIANT_IDS.sixMonth, user_id: USER } },
        data: {
          type: "license-keys",
          id: "lic_1",
          attributes: { store_id: Number(STORE), status: "expired", expires_at: PAST },
        },
      }).reason,
    ).toBe("unknown_variant");
  });
});
