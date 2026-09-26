import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
  getLemonPublicConfig,
  getPublicCheckoutUrl,
  isDemoCheckoutAllowed,
  resolvePaywallCheckout,
} from "./lemon-config";

describe("getPublicCheckoutUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the primary monthly URL over aliases, and reads yearly separately", () => {
    const env = {
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: " https://buy.lemon/month ",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://buy.lemon/month-alias",
      NEXT_PUBLIC_CHECKOUT_URL: "https://buy.lemon/old",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY: " https://buy.lemon/year ",
    };

    expect(getPublicCheckoutUrl("monthly", env)).toBe("https://buy.lemon/month");
    expect(getPublicCheckoutUrl("yearly", env)).toBe("https://buy.lemon/year");
  });

  it("uses the monthly alias when the primary URL is unset", () => {
    const env = {
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://buy.lemon/month-alias",
    };
    expect(getPublicCheckoutUrl("monthly", env)).toBe("https://buy.lemon/month-alias");
    expect(getPublicCheckoutUrl("yearly", env)).toBeUndefined();
  });

  it("falls back to NEXT_PUBLIC_CHECKOUT_URL for monthly", () => {
    const env = { NEXT_PUBLIC_CHECKOUT_URL: "https://buy.lemon/old" };
    expect(getPublicCheckoutUrl("monthly", env)).toBe("https://buy.lemon/old");
    expect(getPublicCheckoutUrl("yearly", env)).toBeUndefined();
  });

  it("does not apply the temporary default when an explicit env map has no URL", () => {
    expect(getPublicCheckoutUrl("monthly", {})).toBeUndefined();
  });

  it("defaults to the temporary Lemon buy URL when subscription env vars are unset", () => {
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL", "");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY", "");
    vi.stubEnv("NEXT_PUBLIC_CHECKOUT_URL", "");
    expect(getLemonPublicConfig()).toEqual({
      monthlyUrl: DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
      yearlyUrl: undefined,
    });
  });

  it("lets subscription env vars override the temporary default", () => {
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL", "https://buy.lemon/live-mo");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY", "https://buy.lemon/live-yr");
    expect(getLemonPublicConfig()).toEqual({
      monthlyUrl: "https://buy.lemon/live-mo",
      yearlyUrl: "https://buy.lemon/live-yr",
    });
  });

  it("uses the monthly alias over the temporary default", () => {
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL", "");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY", "https://buy.lemon/alias");
    expect(getLemonPublicConfig().monthlyUrl).toBe("https://buy.lemon/alias");
  });
});

describe("resolvePaywallCheckout", () => {
  it("uses Lemon CTAs when a public monthly URL is set", () => {
    expect(
      resolvePaywallCheckout({
        publicMonthly: "https://buy.lemon/mo",
        nodeEnv: "development",
      }),
    ).toEqual({ monthlyEnabled: true, yearlyEnabled: false, fallback: "lemon" });
  });

  it("shows yearly when a yearly URL or API variant is present", () => {
    expect(
      resolvePaywallCheckout({
        publicMonthly: "https://buy.lemon/mo",
        publicYearly: "https://buy.lemon/yr",
        nodeEnv: "production",
      }),
    ).toEqual({ monthlyEnabled: true, yearlyEnabled: true, fallback: "lemon" });

    expect(
      resolvePaywallCheckout({
        apiMonthly: true,
        apiYearly: true,
        nodeEnv: "production",
      }),
    ).toEqual({ monthlyEnabled: true, yearlyEnabled: true, fallback: "lemon" });
  });

  it("falls back to demo only in development when Lemon is not configured", () => {
    expect(resolvePaywallCheckout({ nodeEnv: "development" })).toEqual({
      monthlyEnabled: false,
      yearlyEnabled: false,
      fallback: "demo",
    });
    expect(resolvePaywallCheckout({ nodeEnv: "production" })).toEqual({
      monthlyEnabled: false,
      yearlyEnabled: false,
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
