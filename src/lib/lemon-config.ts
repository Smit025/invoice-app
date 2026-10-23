export type CheckoutPlan = "sixMonth" | "monthly";

export type EnvMap = Record<string, string | undefined>;

/** Live Pro 6-month buy link (variant 2238798). */
export const DEFAULT_LEMONSQUEEZY_CHECKOUT_URL =
  "https://myinvoicemaker.lemonsqueezy.com/checkout/buy/f1ffee5b-5cbe-4c44-ba12-1ec93b520ca2?enabled=2238798";

/** Live Pro monthly buy link (variant 2238873). */
export const DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY =
  "https://myinvoicemaker.lemonsqueezy.com/checkout/buy/bd2f2883-79ba-47ec-8610-3287ee80846b?enabled=2238873";

/** Retired test-mode product. Opening it showed a test cart (`Pay $766.52`). */
export const RETIRED_TEST_CHECKOUT_ID = "c3c13987-5ccc-4a5c-b260-fd7eae12baca";

export const LEMON_VARIANT_IDS = {
  sixMonth: "2238798",
  monthly: "2238873",
} as const;

export const LEMON_PRICE_CENTS = {
  sixMonth: 799,
  monthly: 299,
} as const;

export type LemonPublicConfig = {
  sixMonthUrl: string;
  monthlyUrl: string;
};

/** Checkout UUIDs for the two live buy links. Anything else is ignored. */
export const LIVE_CHECKOUT_IDS = {
  sixMonth: "f1ffee5b-5cbe-4c44-ba12-1ec93b520ca2",
  monthly: "bd2f2883-79ba-47ec-8610-3287ee80846b",
} as const;

const SIX_MONTH_URL_KEYS = ["NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL"] as const;

const MONTHLY_URL_KEYS = ["NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY"] as const;

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Shareable Lemon overlays only. API carts (`/checkout/cart/` and `/checkout/custom/`)
 * are rejected so a test-mode key cannot open a test cart.
 */
export function isDirectBuyUrl(value: string | undefined): string | undefined {
  const trimmed = trimEnv(value);
  if (!trimmed) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname.toLowerCase();
  if (host !== "lemonsqueezy.com" && !host.endsWith(".lemonsqueezy.com")) return undefined;
  if (!url.pathname.includes("/checkout/buy/")) return undefined;
  if (url.pathname.includes("/checkout/cart") || url.pathname.includes("/checkout/custom")) {
    return undefined;
  }
  if (url.pathname.includes(RETIRED_TEST_CHECKOUT_ID)) return undefined;
  const testMode = url.searchParams.get("test_mode");
  if (testMode === "1" || testMode === "true") return undefined;
  return trimmed;
}

/** True only for one of the two live `/checkout/buy/` links (uuid + enabled variant). */
export function isAllowlistedBuyUrl(value: string | undefined, plan: CheckoutPlan): boolean {
  const accepted = isDirectBuyUrl(value);
  if (!accepted) return false;
  let url: URL;
  try {
    url = new URL(accepted);
  } catch {
    return false;
  }
  const id = url.pathname.split("/checkout/buy/")[1]?.split("/")[0] ?? "";
  if (id !== LIVE_CHECKOUT_IDS[plan]) return false;
  return url.searchParams.get("enabled") === LEMON_VARIANT_IDS[plan];
}

function allowlistedOrDefault(env: EnvMap, keys: readonly string[], plan: CheckoutPlan, fallback: string): string {
  for (const key of keys) {
    if (isAllowlistedBuyUrl(env[key], plan)) return fallback;
  }
  return fallback;
}

function readPublicEnv(): EnvMap {
  // Next.js inlines `process.env.NEXT_PUBLIC_*` only for direct member access.
  return {
    NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL,
    NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY:
      process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export function getLemonPublicConfig(env: EnvMap = readPublicEnv()): LemonPublicConfig {
  return {
    sixMonthUrl: allowlistedOrDefault(env, SIX_MONTH_URL_KEYS, "sixMonth", DEFAULT_LEMONSQUEEZY_CHECKOUT_URL),
    monthlyUrl: allowlistedOrDefault(env, MONTHLY_URL_KEYS, "monthly", DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY),
  };
}

/** Appends `checkout[custom][user_id]`, with the id percent-encoded and the brackets left intact. */
export function withCheckoutUserId(buyUrl: string, userId: string): string {
  const url = new URL(buyUrl);
  const query = new URLSearchParams(url.search).toString();
  const user = `checkout[custom][user_id]=${encodeURIComponent(userId)}`;
  const base = `${url.origin}${url.pathname}`;
  return query ? `${base}?${query}&${user}` : `${base}?${user}`;
}

export function getPublicCheckoutUrl(plan: CheckoutPlan, env: EnvMap = readPublicEnv()): string {
  const config = getLemonPublicConfig(env);
  return plan === "monthly" ? config.monthlyUrl : config.sixMonthUrl;
}

export function planForVariant(
  variantId: string | undefined,
  variants: { sixMonth: string; monthly: string } = getProVariantIds(),
): CheckoutPlan | undefined {
  if (!variantId) return undefined;
  if (variantId === variants.monthly) return "monthly";
  if (variantId === variants.sixMonth) return "sixMonth";
  return undefined;
}

export function getProVariantIds(env: EnvMap = process.env): { sixMonth: string; monthly: string } {
  return {
    sixMonth: trimEnv(env.LEMONSQUEEZY_VARIANT_ID) ?? LEMON_VARIANT_IDS.sixMonth,
    monthly: trimEnv(env.LEMONSQUEEZY_VARIANT_ID_MONTHLY) ?? LEMON_VARIANT_IDS.monthly,
  };
}

export function isDemoCheckoutAllowed(env: EnvMap = readPublicEnv()): boolean {
  return env.NODE_ENV === "development";
}

export type PaywallCheckoutMode = {
  sixMonthEnabled: boolean;
  monthlyEnabled: boolean;
  fallback: "lemon" | "demo" | "soon";
};

/** Resolve CTA state from public URLs + optional server API capabilities. */
export function resolvePaywallCheckout(input: {
  publicSixMonth?: string;
  publicMonthly?: string;
  apiSixMonth?: boolean;
  apiMonthly?: boolean;
  nodeEnv?: string;
}): PaywallCheckoutMode {
  const sixMonthEnabled = Boolean(input.publicSixMonth || input.apiSixMonth);
  const monthlyEnabled = Boolean(input.publicMonthly || input.apiMonthly);
  if (sixMonthEnabled || monthlyEnabled) {
    return { sixMonthEnabled, monthlyEnabled, fallback: "lemon" };
  }
  if ((input.nodeEnv ?? process.env.NODE_ENV) === "development") {
    return { sixMonthEnabled: false, monthlyEnabled: false, fallback: "demo" };
  }
  return { sixMonthEnabled: false, monthlyEnabled: false, fallback: "soon" };
}
