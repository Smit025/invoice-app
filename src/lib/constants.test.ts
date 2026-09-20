import { describe, expect, it } from "vitest";
import { PRICING } from "./constants";

describe("PRICING", () => {
  it("lists Pro as $7.99 USD one-time with optional $2.99/mo", () => {
    expect(PRICING.oneTime).toBe(7.99);
    expect(PRICING.monthly).toBe(2.99);
  });
});
