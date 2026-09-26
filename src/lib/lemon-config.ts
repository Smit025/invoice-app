export type CheckoutPlan = "monthly" | "yearly";

export type EnvMap = Record<string, string | undefined>;

/**
 * Temporary overlay used only when no subscription checkout URL is set.
 * This is the previous buy link, not a Live subscription variant.
 * After Lemon store approval, replace it by setting:
 * - NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL → monthly subscription ($4.99/mo)
 * - NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY → yearly subscription ($39/yr)
 * Do not invent a new product URL here.
 */
export const DEFAULT_LEMONSQUEEZY_CHECKOUT_URL =
  "https://myinvoicemaker.lemonsqueezy.com/checkout/buy/c3c13987-5ccc-4a5c-b260-fd7eae12baca";

export type LemonPublicConfig = {
  /** Monthly subscription overlay. Primary Unlock Pro checkout. */
  monthlyUrl?: string;
  /** Yearly subscription overlay. Secondary save checkout. */
  yearlyUrl?: string;
};

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readPublicEnv(): EnvMap {
  // Next.js inlines `process.env.NEXT_PUBLIC_*` member access in the client bundle.
  // Passing `process.env` as an object is NOT inlined and throws in the browser.
  return {
    NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL: process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL,
    NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY:
      process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
    NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY:
      process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY,
    NEXT_PUBLIC_CHECKOUT_URL: process.env.NEXT_PUBLIC_CHECKOUT_URL,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/**
 * Monthly subscription URL.
 * Primary env wins, then the monthly alias, then the deprecated checkout alias.
 */
export function resolveMonthlyCheckoutUrl(env: EnvMap): string | undefined {
  return (
    trimEnv(env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL) ??
    trimEnv(env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY) ??
    trimEnv(env.NEXT_PUBLIC_CHECKOUT_URL)
  );
}

export function getLemonPublicConfig(env?: EnvMap): LemonPublicConfig {
  const source = env ?? readPublicEnv();
  const monthlyFromEnv = resolveMonthlyCheckoutUrl(source);
  return {
    // The temporary default applies only when reading process.env with no URL set,
    // so an explicit env map (tests) does not silently pick up the fallback.
    monthlyUrl: monthlyFromEnv ?? (env ? undefined : DEFAULT_LEMONSQUEEZY_CHECKOUT_URL),
    yearlyUrl: trimEnv(source.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_YEARLY),
  };
}

export function getPublicCheckoutUrl(plan: CheckoutPlan, env?: EnvMap): string | undefined {
  const config = getLemonPublicConfig(env);
  return plan === "yearly" ? config.yearlyUrl : config.monthlyUrl;
}

export function isDemoCheckoutAllowed(env: EnvMap = readPublicEnv()): boolean {
  return env.NODE_ENV === "development";
}

export type PaywallCheckoutMode = {
  monthlyEnabled: boolean;
  yearlyEnabled: boolean;
  fallback: "lemon" | "demo" | "soon";
};

/** Resolve CTA state from public subscription URLs + optional server API capabilities. */
export function resolvePaywallCheckout(input: {
  publicMonthly?: string;
  publicYearly?: string;
  apiMonthly?: boolean;
  apiYearly?: boolean;
  nodeEnv?: string;
}): PaywallCheckoutMode {
  const monthlyEnabled = Boolean(input.publicMonthly || input.apiMonthly);
  const yearlyEnabled = Boolean(input.publicYearly || input.apiYearly);
  if (monthlyEnabled || yearlyEnabled) {
    return { monthlyEnabled, yearlyEnabled, fallback: "lemon" };
  }
  if ((input.nodeEnv ?? process.env.NODE_ENV) === "development") {
    return { monthlyEnabled: false, yearlyEnabled: false, fallback: "demo" };
  }
  return { monthlyEnabled: false, yearlyEnabled: false, fallback: "soon" };
}
