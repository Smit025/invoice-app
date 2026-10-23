import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLemonCheckout,
  extractCheckoutUrl,
  isApiCheckoutConfigured,
  isLiveVariantPayload,
  parseCheckoutPlan,
} from "./lemon-server";

const liveConfig = {
  apiKey: "live-key",
  storeId: "2",
  variantId: "2238798",
  monthlyVariantId: "2238873",
  webhookSecret: "",
};

describe("parseCheckoutPlan", () => {
  it("accepts sixMonth and monthly only", () => {
    expect(parseCheckoutPlan("sixMonth")).toBe("sixMonth");
    expect(parseCheckoutPlan("monthly")).toBe("monthly");
    expect(parseCheckoutPlan("yearly")).toBeUndefined();
    expect(parseCheckoutPlan("weekly")).toBeUndefined();
    expect(parseCheckoutPlan(undefined)).toBeUndefined();
  });
});

describe("isApiCheckoutConfigured", () => {
  const base = {
    apiKey: "key",
    storeId: "1",
    variantId: "10",
    monthlyVariantId: "",
    webhookSecret: "",
  };

  it("requires api key, store, and the variant for that plan", () => {
    expect(isApiCheckoutConfigured("sixMonth", base)).toBe(true);
    expect(isApiCheckoutConfigured("monthly", base)).toBe(false);
    expect(isApiCheckoutConfigured("sixMonth", { ...base, apiKey: "" })).toBe(false);
    expect(isApiCheckoutConfigured("monthly", { ...base, monthlyVariantId: "11" })).toBe(true);
  });
});

describe("createLemonCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the API is not configured", async () => {
    const fetchImpl = vi.fn();
    const result = await createLemonCheckout({
      plan: "sixMonth",
      origin: "http://localhost:3000",
      config: {
        apiKey: "",
        storeId: "",
        variantId: "",
        monthlyVariantId: "",
        webhookSecret: "",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Lemon Squeezy API checkout is not configured",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not create a cart when the variant is in test mode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { attributes: { test_mode: true } } }),
    });

    const result = await createLemonCheckout({
      plan: "monthly",
      origin: "https://invoice.example",
      config: liveConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "Refusing to create a test-mode Lemon Squeezy cart",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/v1/variants/2238873");
  });

  it("posts to the Lemon checkouts API only after the variant is live", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { attributes: { test_mode: false } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              test_mode: false,
              url: "https://store.lemonsqueezy.com/checkout/custom/abc",
            },
          },
        }),
      });

    const result = await createLemonCheckout({
      plan: "sixMonth",
      origin: "https://invoice.example",
      config: liveConfig,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      url: "https://store.lemonsqueezy.com/checkout/custom/abc",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer live-key",
      Accept: "application/vnd.api+json",
    });
    const body = JSON.parse(String(init.body)) as {
      data: {
        attributes: { test_mode: boolean; product_options: { redirect_url: string } };
      };
    };
    expect(body.data.attributes.test_mode).toBe(false);
    expect(body.data.attributes.product_options.redirect_url).toBe(
      "https://invoice.example/thanks?pro=1&plan=sixMonth",
    );
  });

  it("extracts checkout URLs and live variant flags", () => {
    expect(extractCheckoutUrl({ data: { attributes: { url: "https://x" } } })).toBe("https://x");
    expect(extractCheckoutUrl({ data: { attributes: { url: "" } } })).toBeUndefined();
    expect(extractCheckoutUrl(null)).toBeUndefined();
    expect(isLiveVariantPayload({ data: { attributes: { test_mode: false } } })).toBe(true);
    expect(isLiveVariantPayload({ data: { attributes: { test_mode: true } } })).toBe(false);
    expect(isLiveVariantPayload({ data: { attributes: {} } })).toBe(false);
  });
});
