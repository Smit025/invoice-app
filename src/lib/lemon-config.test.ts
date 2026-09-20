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
  it("prefers NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL over the deprecated alias", () => {
    const env = {
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: " https://buy.lemon/one ",
      NEXT_PUBLIC_CHECKOUT_URL: "https://buy.lemon/old",
      NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY: "https://buy.lemon/mo",
    };

    expect(getPublicCheckoutUrl("onetime", env)).toBe("https://buy.lemon/one");
    expect(getPublicCheckoutUrl("monthly", env)).toBe("https://buy.lemon/mo");
  });

  it("falls back to NEXT_PUBLIC_CHECKOUT_URL for one-time", () => {
    const env = { NEXT_PUBLIC_CHECKOUT_URL: "https://buy.lemon/old" };
    expect(getPublicCheckoutUrl("onetime", env)).toBe("https://buy.lemon/old");
    expect(getPublicCheckoutUrl("monthly", env)).toBeUndefined();
  });

  it("defaults to the public $48 Lemon buy URL when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL;
    delete process.env.NEXT_PUBLIC_CHECKOUT_URL;
    expect(getLemonPublicConfig().oneTimeUrl).toBe(DEFAULT_LEMONSQUEEZY_CHECKOUT_URL);
  });

  it("lets NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL override the default", () => {
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL", "https://buy.lemon/live");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY", "https://buy.lemon/mo-live");
    expect(getLemonPublicConfig()).toEqual({
      oneTimeUrl: "https://buy.lemon/live",
      monthlyUrl: "https://buy.lemon/mo-live",
    });
  });
});

describe("resolvePaywallCheckout", () => {
  it("uses Lemon CTAs when a public one-time URL is set", () => {
    expect(
      resolvePaywallCheckout({
        publicOneTime: "https://buy.lemon/one",
        nodeEnv: "development",
      }),
    ).toEqual({ oneTimeEnabled: true, monthlyEnabled: false, fallback: "lemon" });
  });

  it("shows monthly when a monthly URL or API variant is present", () => {
    expect(
      resolvePaywallCheckout({
        publicOneTime: "https://buy.lemon/one",
        publicMonthly: "https://buy.lemon/mo",
        nodeEnv: "production",
      }),
    ).toEqual({ oneTimeEnabled: true, monthlyEnabled: true, fallback: "lemon" });

    expect(
      resolvePaywallCheckout({
        apiOneTime: true,
        apiMonthly: true,
        nodeEnv: "production",
      }),
    ).toEqual({ oneTimeEnabled: true, monthlyEnabled: true, fallback: "lemon" });
  });

  it("falls back to demo only in development when Lemon is not configured", () => {
    expect(resolvePaywallCheckout({ nodeEnv: "development" })).toEqual({
      oneTimeEnabled: false,
      monthlyEnabled: false,
      fallback: "demo",
    });
    expect(resolvePaywallCheckout({ nodeEnv: "production" })).toEqual({
      oneTimeEnabled: false,
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
