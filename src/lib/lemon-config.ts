export type CheckoutPlan = "onetime" | "monthly";

export type EnvMap = Record<string, string | undefined>;

export type LemonPublicConfig = {
  oneTimeUrl?: string;
  monthlyUrl?: string;
};

function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getLemonPublicConfig(env: EnvMap = process.env): LemonPublicConfig {
  return {
    oneTimeUrl:
      trimEnv(env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL) ??
      trimEnv(env.NEXT_PUBLIC_CHECKOUT_URL),
    monthlyUrl: trimEnv(env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY),
  };
}

export function getPublicCheckoutUrl(plan: CheckoutPlan, env: EnvMap = process.env): string | undefined {
  const config = getLemonPublicConfig(env);
  return plan === "monthly" ? config.monthlyUrl : config.oneTimeUrl;
}

export function isDemoCheckoutAllowed(env: EnvMap = process.env): boolean {
  return env.NODE_ENV === "development";
}

export type PaywallCheckoutMode = {
  oneTimeEnabled: boolean;
  monthlyEnabled: boolean;
  fallback: "lemon" | "demo" | "soon";
};

/** Resolve CTA state from public URLs + optional server API capabilities. */
export function resolvePaywallCheckout(input: {
  publicOneTime?: string;
  publicMonthly?: string;
  apiOneTime?: boolean;
  apiMonthly?: boolean;
  nodeEnv?: string;
}): PaywallCheckoutMode {
  const oneTimeEnabled = Boolean(input.publicOneTime || input.apiOneTime);
  const monthlyEnabled = Boolean(input.publicMonthly || input.apiMonthly);
  if (oneTimeEnabled || monthlyEnabled) {
    return { oneTimeEnabled, monthlyEnabled, fallback: "lemon" };
  }
  if ((input.nodeEnv ?? process.env.NODE_ENV) === "development") {
    return { oneTimeEnabled: false, monthlyEnabled: false, fallback: "demo" };
  }
  return { oneTimeEnabled: false, monthlyEnabled: false, fallback: "soon" };
}
