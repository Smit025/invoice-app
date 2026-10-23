import {
  getProVariantIds,
  type CheckoutPlan,
  type EnvMap,
} from "./lemon-config";

export type LemonServerConfig = {
  apiKey: string;
  storeId: string;
  variantId: string;
  monthlyVariantId: string;
  webhookSecret: string;
};

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getLemonServerConfig(env: EnvMap = process.env): LemonServerConfig {
  const variants = getProVariantIds(env);
  return {
    apiKey: trimEnv(env.LEMONSQUEEZY_API_KEY),
    storeId: trimEnv(env.LEMONSQUEEZY_STORE_ID),
    variantId: variants.sixMonth,
    monthlyVariantId: variants.monthly,
    webhookSecret: trimEnv(env.LEMONSQUEEZY_WEBHOOK_SECRET),
  };
}

export function isApiCheckoutConfigured(
  plan: CheckoutPlan,
  config: LemonServerConfig = getLemonServerConfig(),
): boolean {
  if (!config.apiKey || !config.storeId) return false;
  return plan === "monthly" ? Boolean(config.monthlyVariantId) : Boolean(config.variantId);
}

export function variantIdForPlan(
  plan: CheckoutPlan,
  config: LemonServerConfig = getLemonServerConfig(),
): string | undefined {
  const id = plan === "monthly" ? config.monthlyVariantId : config.variantId;
  return id || undefined;
}

export type CreateLemonCheckoutInput = {
  plan: CheckoutPlan;
  origin: string;
  config?: LemonServerConfig;
  fetchImpl?: typeof fetch;
};

export type CreateLemonCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

function lemonHeaders(apiKey: string): HeadersInit {
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/** True only when Lemon says this variant was created outside test mode. */
export function isLiveVariantPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const attributes = (data as { attributes?: unknown }).attributes;
  if (!attributes || typeof attributes !== "object") return false;
  return (attributes as { test_mode?: unknown }).test_mode === false;
}

/**
 * Creates a Lemon checkout only after the variant is confirmed live (`test_mode: false`).
 * The paywall does not call this — it opens the live `/checkout/buy/` links. A test-mode
 * API key can only see test variants, so it cannot create a `/checkout/cart/` overlay.
 */
export async function createLemonCheckout({
  plan,
  origin,
  config = getLemonServerConfig(),
  fetchImpl = fetch,
}: CreateLemonCheckoutInput): Promise<CreateLemonCheckoutResult> {
  if (!isApiCheckoutConfigured(plan, config)) {
    return { ok: false, status: 503, error: "Lemon Squeezy API checkout is not configured" };
  }

  const variantId = variantIdForPlan(plan, config);
  if (!variantId) {
    return { ok: false, status: 503, error: "Lemon Squeezy variant is not configured" };
  }

  let variantPayload: unknown;
  try {
    const variantResponse = await fetchImpl(`https://api.lemonsqueezy.com/v1/variants/${variantId}`, {
      method: "GET",
      headers: lemonHeaders(config.apiKey),
    });
    if (!variantResponse.ok) {
      return { ok: false, status: 502, error: "Lemon Squeezy variant could not be verified as live" };
    }
    variantPayload = await variantResponse.json();
  } catch {
    return { ok: false, status: 502, error: "Lemon Squeezy variant could not be verified as live" };
  }

  if (!isLiveVariantPayload(variantPayload)) {
    return { ok: false, status: 403, error: "Refusing to create a test-mode Lemon Squeezy cart" };
  }

  const numericId = Number(variantId);
  const enabledVariant = Number.isFinite(numericId) ? numericId : variantId;
  const redirectUrl = `${origin.replace(/\/$/, "")}/thanks?pro=1&plan=${plan}`;
  let response: Response;
  try {
    response = await fetchImpl("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: lemonHeaders(config.apiKey),
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_options: { embed: true },
            product_options: {
              redirect_url: redirectUrl,
              enabled_variants: [enabledVariant],
            },
            test_mode: false,
          },
          relationships: {
            store: { data: { type: "stores", id: config.storeId } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });
  } catch {
    return { ok: false, status: 502, error: "Lemon Squeezy checkout request failed" };
  }

  if (!response.ok) {
    return { ok: false, status: 502, error: "Lemon Squeezy checkout request failed" };
  }

  const payload: unknown = await response.json();
  if (!isLiveVariantPayload(payload)) {
    return { ok: false, status: 403, error: "Refusing to create a test-mode Lemon Squeezy cart" };
  }
  const url = extractCheckoutUrl(payload);
  if (!url || url.includes("/checkout/cart")) {
    return { ok: false, status: 403, error: "Refusing to open a Lemon Squeezy cart URL" };
  }

  return { ok: true, url };
}

export function extractCheckoutUrl(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return undefined;
  const attributes = (data as { attributes?: unknown }).attributes;
  if (!attributes || typeof attributes !== "object") return undefined;
  const url = (attributes as { url?: unknown }).url;
  return typeof url === "string" && url.trim() ? url : undefined;
}

export function parseCheckoutPlan(value: unknown): CheckoutPlan | undefined {
  return value === "sixMonth" || value === "monthly" ? value : undefined;
}
