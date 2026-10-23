import { describe, expect, it } from "vitest";
import { LEMON_VARIANT_IDS } from "./lemon-config";
import { readCheckoutSuccess } from "./lemon-checkout-success";
import {
  applyLicenseDecision,
  licenseIsActive,
  resolveLemonLicense,
  type StoredLicense,
} from "./lemon-license";

const NOW = new Date("2026-10-23T00:00:00.000Z");
const FUTURE = "2026-11-23T00:00:00.000Z";
const PAST = "2026-10-01T00:00:00.000Z";

function subscription(
  event: string,
  variantId: string,
  attributes: Record<string, unknown> = {},
  id = "sub_1",
) {
  return {
    meta: { event_name: event },
    data: {
      type: "subscriptions",
      id,
      attributes: {
        variant_id: Number(variantId),
        status: "active",
        ends_at: null,
        ...attributes,
      },
    },
  };
}

function activeNow(store: Map<string, StoredLicense>, id = "sub_1", now = NOW) {
  return licenseIsActive(store.get(id), now);
}

describe("subscription license unlock", () => {
  it.each([
    ["monthly", LEMON_VARIANT_IDS.monthly],
    ["sixMonth", LEMON_VARIANT_IDS.sixMonth],
  ] as const)("Pro ends when a %s subscription expires", (plan, variantId) => {
    const store = new Map<string, StoredLicense>();

    const created = resolveLemonLicense(
      subscription("subscription_created", variantId, { status: "active", user_email: "hidden@example.com" }),
      { now: NOW },
    );
    expect(created).toMatchObject({ action: "grant", active: true, plan, variantId });
    applyLicenseDecision(store, created);
    expect(activeNow(store)).toBe(true);

    const updated = resolveLemonLicense(
      subscription("subscription_updated", variantId, { status: "active", renews_at: FUTURE }),
      { now: NOW },
    );
    expect(updated.action).toBe("grant");
    applyLicenseDecision(store, updated);

    const paid = resolveLemonLicense(
      {
        meta: { event_name: "subscription_payment_success" },
        data: {
          type: "subscription-invoices",
          id: "inv_1",
          attributes: {
            subscription_id: "sub_1",
            status: "paid",
            subtotal: plan === "monthly" ? 299 : 799,
            currency: "USD",
            user_email: "hidden@example.com",
          },
        },
      },
      { now: NOW },
    );
    expect(paid).toMatchObject({ action: "grant", active: true, plan, variantId, subjectId: "sub_1" });
    applyLicenseDecision(store, paid);
    expect(activeNow(store)).toBe(true);

    const cancelled = resolveLemonLicense(
      subscription("subscription_cancelled", variantId, { status: "cancelled", ends_at: FUTURE }),
      { now: NOW },
    );
    expect(cancelled).toMatchObject({
      action: "grant",
      active: true,
      endsAt: FUTURE,
      reason: "cancelled_until_period_end",
    });
    applyLicenseDecision(store, cancelled);
    expect(activeNow(store, "sub_1", NOW)).toBe(true);
    expect(activeNow(store, "sub_1", new Date(FUTURE))).toBe(false);

    const expired = resolveLemonLicense(
      subscription("subscription_expired", variantId, { status: "expired", ends_at: FUTURE }),
      { now: NOW },
    );
    expect(expired).toMatchObject({ action: "revoke", active: false, plan, reason: "expired" });
    applyLicenseDecision(store, expired);
    expect(activeNow(store)).toBe(false);
  });

  it("matches payment success by price when the invoice has no variant id", () => {
    expect(
      resolveLemonLicense(
        {
          meta: { event_name: "subscription_payment_success" },
          data: { type: "subscription-invoices", id: "inv_9", attributes: { subscription_id: 9, subtotal: 299, status: "paid" } },
        },
        { now: NOW },
      ).plan,
    ).toBe("monthly");

    expect(
      resolveLemonLicense(
        {
          meta: { event_name: "subscription_payment_success" },
          data: {
            type: "subscription-invoices",
            id: "inv_8",
            attributes: { subscription_id: 8, subtotal_usd: 799, total: 850, status: "paid" },
          },
        },
        { now: NOW },
      ).plan,
    ).toBe("sixMonth");
  });

  it("does not grant an unknown variant or a permanent order", () => {
    expect(
      resolveLemonLicense(subscription("subscription_created", "999", { status: "active" }), { now: NOW }).action,
    ).toBe("ignore");

    const order = resolveLemonLicense(
      {
        meta: { event_name: "order_created" },
        data: {
          type: "orders",
          id: "ord_1",
          attributes: { first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) }, status: "paid" },
        },
      },
      { now: NOW },
    );
    expect(order).toMatchObject({ action: "ignore", active: false });
  });

  it("revokes a cancelled subscription once ends_at is in the past", () => {
    const decision = resolveLemonLicense(
      subscription("subscription_cancelled", LEMON_VARIANT_IDS.monthly, { status: "cancelled", ends_at: PAST }),
      { now: NOW },
    );
    expect(decision).toMatchObject({ action: "revoke", active: false });
  });

  it("revokes an expired or disabled license key for either variant", () => {
    const expired = resolveLemonLicense(
      {
        meta: { event_name: "license_key_updated", custom_data: { variant_id: LEMON_VARIANT_IDS.sixMonth } },
        data: { type: "license-keys", id: "lic_1", attributes: { status: "expired", expires_at: PAST } },
      },
      { now: NOW },
    );
    expect(expired).toMatchObject({ action: "revoke", active: false, plan: "sixMonth" });

    const disabled = resolveLemonLicense(
      {
        meta: { event_name: "license_key_updated" },
        data: {
          type: "license-keys",
          id: "lic_2",
          attributes: { variant_id: LEMON_VARIANT_IDS.monthly, status: "disabled" },
        },
      },
      { now: NOW },
    );
    expect(disabled.action).toBe("revoke");
  });

  it("reads variant and renewal hints from a Checkout.Success payload", () => {
    expect(
      readCheckoutSuccess({
        order: { data: { attributes: { first_order_item: { variant_id: 2238873 }, renews_at: FUTURE } } },
      }),
    ).toEqual({ variantId: "2238873", renewsAt: FUTURE });
  });
});
