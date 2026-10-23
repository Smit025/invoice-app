import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
  getLemonPublicConfig,
  getPublicCheckoutUrl,
  isAllowlistedBuyUrl,
  isDemoCheckoutAllowed,
  isDirectBuyUrl,
  LEMON_VARIANT_IDS,
  resolvePaywallCheckout,
  RETIRED_TEST_CHECKOUT_ID,
  withCheckoutUserId,
} from "./lemon-config";

const LIVE_SIX =
  "https://myinvoicemaker.lemonsqueezy.com/checkout/buy/f1ffee5b-5cbe-4c44-ba12-1ec93b520ca2?enabled=2238798";
const LIVE_MONTHLY =
  "https://myinvoicemaker.lemonsqueezy.com/checkout/buy/bd2f2883-79ba-47ec-8610-3287ee80846b?enabled=2238873";

describe("live checkout defaults", () => {
  it("uses the approved live buy links and variant ids", () => {
    expect(DEFAULT_LEMONSQUEEZY_CHECKOUT_URL).toBe(LIVE_SIX);
    expect(DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY).toBe(LIVE_MONTHLY);
    expect(LEMON_VARIANT_IDS.sixMonth).toBe("2238798");
    expect(LEMON_VARIANT_IDS.monthly).toBe("2238873");
    expect(getPublicCheckoutUrl("sixMonth", {})).toBe(LIVE_SIX);
    expect(getPublicCheckoutUrl("monthly", {})).toBe(LIVE_MONTHLY);
  });

  it("rejects the retired test buy link and API cart URLs", () => {
    const retired = `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/${RETIRED_TEST_CHECKOUT_ID}`;
    expect(isDirectBuyUrl(retired)).toBeUndefined();
    expect(isDirectBuyUrl("https://myinvoicemaker.lemonsqueezy.com/checkout/cart/abc")).toBeUndefined();
    expect(isDirectBuyUrl("https://myinvoicemaker.lemonsqueezy.com/checkout/custom/abc")).toBeUndefined();
    expect(
      isDirectBuyUrl(`${LIVE_SIX}&test_mode=1`.replace("?enabled", "?test_mode=1&enabled")),
    ).toBeUndefined();
  });
});

describe("getPublicCheckoutUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allowlists only the two live buy links", () => {
    expect(isAllowlistedBuyUrl(LIVE_SIX, "sixMonth")).toBe(true);
    expect(isAllowlistedBuyUrl(LIVE_MONTHLY, "monthly")).toBe(true);
    expect(isAllowlistedBuyUrl(LIVE_SIX, "monthly")).toBe(false);
    expect(isAllowlistedBuyUrl("https://store.lemonsqueezy.com/checkout/buy/not-live?enabled=2238798", "sixMonth")).toBe(
      false,
    );
  });

  it("ignores non-public names and any buy link that is not one of the two live URLs", () => {
    const env = {
      LEMONSQUEEZY_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-live?enabled=2238798",
      LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://store.lemonsqueezy.com/checkout/buy/mo-live?enabled=2238873",
      NEXT_PUBLIC_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-alias",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-old?enabled=2238798",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY:
        "https://store.lemonsqueezy.com/checkout/buy/mo-old?enabled=2238873",
    };
    expect(getPublicCheckoutUrl("sixMonth", env)).toBe(LIVE_SIX);
    expect(getPublicCheckoutUrl("monthly", env)).toBe(LIVE_MONTHLY);
    expect(getLemonPublicConfig(env)).toEqual({
      sixMonthUrl: LIVE_SIX,
      monthlyUrl: LIVE_MONTHLY,
    });
  });

  it("accepts the live URLs when set on the public env names", () => {
    const env = {
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: ` ${LIVE_SIX} `,
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: LIVE_MONTHLY,
    };
    expect(getLemonPublicConfig(env)).toEqual({
      sixMonthUrl: LIVE_SIX,
      monthlyUrl: LIVE_MONTHLY,
    });
  });

  it("appends a percent-encoded install id as checkout custom data", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    expect(withCheckoutUserId(LIVE_MONTHLY, userId)).toBe(
      `${LIVE_MONTHLY}&checkout[custom][user_id]=${encodeURIComponent(userId)}`,
    );
  });
});

describe("resolvePaywallCheckout", () => {
  it("uses Lemon CTAs when a public 6-month URL is set", () => {
    expect(
      resolvePaywallCheckout({
        publicSixMonth: "https://store.lemonsqueezy.com/checkout/buy/six",
        nodeEnv: "development",
      }),
    ).toEqual({ sixMonthEnabled: true, monthlyEnabled: false, fallback: "lemon" });
  });

  it("shows monthly when a monthly URL or API variant is present", () => {
    expect(
      resolvePaywallCheckout({
        publicSixMonth: "https://store.lemonsqueezy.com/checkout/buy/six",
        publicMonthly: "https://store.lemonsqueezy.com/checkout/buy/mo",
        nodeEnv: "production",
      }),
    ).toEqual({ sixMonthEnabled: true, monthlyEnabled: true, fallback: "lemon" });

    expect(
      resolvePaywallCheckout({
        apiSixMonth: true,
        apiMonthly: true,
        nodeEnv: "production",
      }),
    ).toEqual({ sixMonthEnabled: true, monthlyEnabled: true, fallback: "lemon" });
  });

  it("falls back to demo only in development when Lemon is not configured", () => {
    expect(resolvePaywallCheckout({ nodeEnv: "development" })).toEqual({
      sixMonthEnabled: false,
      monthlyEnabled: false,
      fallback: "demo",
    });
    expect(resolvePaywallCheckout({ nodeEnv: "production" })).toEqual({
      sixMonthEnabled: false,
      monthlyEnabled: false,
      fallback: "soon",
    });
  });
});

describe("isDemoCheckoutAllowed", () => {
  it("is true only for NODE_ENV=development", () => {
    expect(isDemoCheckoutAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(isDemoCheckoutAllowed({ NODE_ENV: "production" })).toBe(false);
  });
});
