import { describe, expect, it } from "vitest";
import { PRICING } from "./constants";

describe("PRICING", () => {
  it("lists Pro as $4.99/mo or $39/yr", () => {
    expect(PRICING.monthly).toBe(4.99);
    expect(PRICING.yearly).toBe(39);
  });
});
