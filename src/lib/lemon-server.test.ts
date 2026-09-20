import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLemonCheckout,
  extractCheckoutUrl,
  isApiCheckoutConfigured,
  parseCheckoutPlan,
} from "./lemon-server";

describe("parseCheckoutPlan", () => {
  it("accepts onetime and monthly only", () => {
    expect(parseCheckoutPlan("onetime")).toBe("onetime");
    expect(parseCheckoutPlan("monthly")).toBe("monthly");
    expect(parseCheckoutPlan("yearly")).toBeUndefined();
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
    expect(isApiCheckoutConfigured("onetime", base)).toBe(true);
    expect(isApiCheckoutConfigured("monthly", base)).toBe(false);
    expect(isApiCheckoutConfigured("onetime", { ...base, apiKey: "" })).toBe(false);
    expect(
      isApiCheckoutConfigured("monthly", { ...base, monthlyVariantId: "11" }),
    ).toBe(true);
  });
});

describe("createLemonCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the API is not configured", async () => {
    const result = await createLemonCheckout({
      plan: "onetime",
      origin: "http://localhost:3000",
      config: {
        apiKey: "",
        storeId: "",
        variantId: "",
        monthlyVariantId: "",
        webhookSecret: "",
      },
    });
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "Lemon Squeezy API checkout is not configured",
    });
  });

  it("posts to the Lemon checkouts API and returns the overlay URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { attributes: { url: "https://store.lemonsqueezy.com/checkout/custom/abc" } },
      }),
    });

    const result = await createLemonCheckout({
      plan: "onetime",
      origin: "https://invoice.example",
      config: {
        apiKey: "key",
        storeId: "2",
        variantId: "99",
        monthlyVariantId: "",
        webhookSecret: "",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: true,
      url: "https://store.lemonsqueezy.com/checkout/custom/abc",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer key",
      Accept: "application/vnd.api+json",
    });
    const body = JSON.parse(String(init.body)) as {
      data: { attributes: { product_options: { redirect_url: string } }; relationships: unknown };
    };
    expect(body.data.attributes.product_options.redirect_url).toBe(
      "https://invoice.example/thanks?pro=1",
    );
  });

  it("extracts checkout URLs from JSON:API payloads", () => {
    expect(extractCheckoutUrl({ data: { attributes: { url: "https://x" } } })).toBe("https://x");
    expect(extractCheckoutUrl({ data: { attributes: { url: "" } } })).toBeUndefined();
    expect(extractCheckoutUrl(null)).toBeUndefined();
  });
});
