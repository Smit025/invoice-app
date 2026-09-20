import type { CheckoutPlan, EnvMap } from "./lemon-config";

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
  return {
    apiKey: trimEnv(env.LEMONSQUEEZY_API_KEY),
    storeId: trimEnv(env.LEMONSQUEEZY_STORE_ID),
    variantId: trimEnv(env.LEMONSQUEEZY_VARIANT_ID),
    monthlyVariantId: trimEnv(env.LEMONSQUEEZY_VARIANT_ID_MONTHLY),
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

  const numericId = Number(variantId);
  const enabledVariant = Number.isFinite(numericId) ? numericId : variantId;
  const redirectUrl = `${origin.replace(/\/$/, "")}/thanks?pro=1`;
  const response = await fetchImpl("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_options: { embed: true },
          product_options: {
            redirect_url: redirectUrl,
            enabled_variants: [enabledVariant],
          },
        },
        relationships: {
          store: { data: { type: "stores", id: config.storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    return { ok: false, status: 502, error: "Lemon Squeezy checkout request failed" };
  }

  const payload: unknown = await response.json();
  const url = extractCheckoutUrl(payload);
  if (!url) {
    return { ok: false, status: 502, error: "Lemon Squeezy checkout URL missing" };
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
  return value === "onetime" || value === "monthly" ? value : undefined;
}
