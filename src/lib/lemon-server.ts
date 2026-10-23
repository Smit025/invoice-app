import { getProVariantIds, type EnvMap } from "./lemon-config";

export type LemonServerConfig = {
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
    storeId: trimEnv(env.LEMONSQUEEZY_STORE_ID),
    variantId: variants.sixMonth,
    monthlyVariantId: variants.monthly,
    webhookSecret: trimEnv(env.LEMONSQUEEZY_WEBHOOK_SECRET),
  };
}
