import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
  getLemonPublicConfig,
  getPublicCheckoutUrl,
  isDemoCheckoutAllowed,
  isDirectBuyUrl,
  LEMON_VARIANT_IDS,
  resolvePaywallCheckout,
  RETIRED_TEST_CHECKOUT_ID,
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

  it("prefers LEMONSQUEEZY_CHECKOUT_URL over the public aliases", () => {
    const env = {
      LEMONSQUEEZY_CHECKOUT_URL: " https://store.lemonsqueezy.com/checkout/buy/six-live ",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-old",
      NEXT_PUBLIC_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-older",
      LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://store.lemonsqueezy.com/checkout/buy/mo-live",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://store.lemonsqueezy.com/checkout/buy/mo-old",
    };

    expect(getPublicCheckoutUrl("sixMonth", env)).toBe(
      "https://store.lemonsqueezy.com/checkout/buy/six-live",
    );
    expect(getPublicCheckoutUrl("monthly", env)).toBe(
      "https://store.lemonsqueezy.com/checkout/buy/mo-live",
    );
  });

  it("falls back to NEXT_PUBLIC_CHECKOUT_URL for the 6-month plan", () => {
    const env = {
      NEXT_PUBLIC_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/six-alias",
    };
    expect(getPublicCheckoutUrl("sixMonth", env)).toBe(
      "https://store.lemonsqueezy.com/checkout/buy/six-alias",
    );
    expect(getPublicCheckoutUrl("monthly", env)).toBe(LIVE_MONTHLY);
  });

  it("ignores the retired test URL and uses the live default", () => {
    const env = {
      LEMONSQUEEZY_CHECKOUT_URL: `https://myinvoicemaker.lemonsqueezy.com/checkout/buy/${RETIRED_TEST_CHECKOUT_ID}`,
      LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://myinvoicemaker.lemonsqueezy.com/checkout/cart/test",
    };
    expect(getLemonPublicConfig(env)).toEqual({
      sixMonthUrl: LIVE_SIX,
      monthlyUrl: LIVE_MONTHLY,
    });
  });

  it("lets LEMONSQUEEZY_CHECKOUT_URL override the default", () => {
    vi.stubEnv("LEMONSQUEEZY_CHECKOUT_URL", "https://store.lemonsqueezy.com/checkout/buy/live");
    vi.stubEnv(
      "LEMONSQUEEZY_CHECKOUT_URL_MONTHLY",
      "https://store.lemonsqueezy.com/checkout/buy/mo-live",
    );
    expect(getLemonPublicConfig()).toEqual({
      sixMonthUrl: "https://store.lemonsqueezy.com/checkout/buy/live",
      monthlyUrl: "https://store.lemonsqueezy.com/checkout/buy/mo-live",
    });
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
