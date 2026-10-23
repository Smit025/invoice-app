import { describe, expect, it } from "vitest";
import { LEMON_VARIANT_IDS } from "./lemon-config";
import { getLemonServerConfig } from "./lemon-server";

describe("getLemonServerConfig", () => {
  it("reads the store id and webhook secret and defaults the live variants", () => {
    expect(
      getLemonServerConfig({
        LEMONSQUEEZY_STORE_ID: " 42 ",
        LEMONSQUEEZY_WEBHOOK_SECRET: " whsec_test ",
      }),
    ).toEqual({
      storeId: "42",
      webhookSecret: "whsec_test",
      variantId: LEMON_VARIANT_IDS.sixMonth,
      monthlyVariantId: LEMON_VARIANT_IDS.monthly,
    });
  });
});
