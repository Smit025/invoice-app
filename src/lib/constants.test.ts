import { describe, expect, it } from "vitest";
import { PRICE_LABEL, PRICING, proPlanButtonLabel } from "./constants";

describe("PRICING", () => {
  it("lists Pro as $2.99/mo and $7.99 every 6 months", () => {
    expect(PRICING.monthly).toBe(2.99);
    expect(PRICING.sixMonth).toBe(7.99);
    expect(PRICE_LABEL.monthly).toBe("$2.99/mo");
    expect(PRICE_LABEL.sixMonth).toBe("$7.99 every 6 months");
    expect(proPlanButtonLabel("monthly")).toBe("Unlock Pro — $2.99/mo");
    expect(proPlanButtonLabel("sixMonth")).toBe("Unlock Pro — $7.99 every 6 months");
  });
});
