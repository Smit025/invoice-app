import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLemonCheckout,
  extractCheckoutUrl,
  getLemonServerConfig,
  isApiCheckoutConfigured,
  parseCheckoutPlan,
} from "./lemon-server";

describe("parseCheckoutPlan", () => {
  it("accepts monthly and yearly subscriptions only", () => {
    expect(parseCheckoutPlan("monthly")).toBe("monthly");
    expect(parseCheckoutPlan("yearly")).toBe("yearly");
    expect(parseCheckoutPlan("onetime")).toBeUndefined();
    expect(parseCheckoutPlan(undefined)).toBeUndefined();
  });
});

describe("getLemonServerConfig", () => {
  it("uses the legacy variant id as the monthly fallback", () => {
    expect(
      getLemonServerConfig({
        LEMONSQUEEZY_VARIANT_ID: "legacy",
        LEMONSQUEEZY_VARIANT_ID_YEARLY: "yr",
      }),
    ).toMatchObject({ monthlyVariantId: "legacy", yearlyVariantId: "yr" });
  });

  it("prefers the monthly variant id over the legacy alias", () => {
    expect(
      getLemonServerConfig({
        LEMONSQUEEZY_VARIANT_ID: "legacy",
        LEMONSQUEEZY_VARIANT_ID_MONTHLY: "month",
      }).monthlyVariantId,
    ).toBe("month");
  });
});

describe("isApiCheckoutConfigured", () => {
  const base = {
    apiKey: "key",
    storeId: "1",
    monthlyVariantId: "10",
    yearlyVariantId: "",
    webhookSecret: "",
  };

  it("requires api key, store, and the variant for that plan", () => {
    expect(isApiCheckoutConfigured("monthly", base)).toBe(true);
    expect(isApiCheckoutConfigured("yearly", base)).toBe(false);
    expect(isApiCheckoutConfigured("monthly", { ...base, apiKey: "" })).toBe(false);
    expect(isApiCheckoutConfigured("yearly", { ...base, yearlyVariantId: "11" })).toBe(true);
  });
});

describe("createLemonCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 503 when the API is not configured", async () => {
    const result = await createLemonCheckout({
      plan: "monthly",
      origin: "http://localhost:3000",
      config: {
        apiKey: "",
        storeId: "",
        monthlyVariantId: "",
        yearlyVariantId: "",
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
      plan: "monthly",
      origin: "https://invoice.example",
      config: {
        apiKey: "key",
        storeId: "2",
        monthlyVariantId: "99",
        yearlyVariantId: "",
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
    expect(body.data.relationships).toEqual({
      store: { data: { type: "stores", id: "2" } },
      variant: { data: { type: "variants", id: "99" } },
    });
  });

  it("posts the yearly subscription variant id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { attributes: { url: "https://store.lemonsqueezy.com/checkout/custom/year" } },
      }),
    });

    const result = await createLemonCheckout({
      plan: "yearly",
      origin: "https://invoice.example",
      config: {
        apiKey: "key",
        storeId: "2",
        monthlyVariantId: "99",
        yearlyVariantId: "100",
        webhookSecret: "",
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      data: { relationships: { variant: { data: { id: string } } } };
    };
    expect(body.data.relationships.variant.data.id).toBe("100");
  });

  it("extracts checkout URLs from JSON:API payloads", () => {
    expect(extractCheckoutUrl({ data: { attributes: { url: "https://x" } } })).toBe("https://x");
    expect(extractCheckoutUrl({ data: { attributes: { url: "" } } })).toBeUndefined();
    expect(extractCheckoutUrl(null)).toBeUndefined();
  });
});
