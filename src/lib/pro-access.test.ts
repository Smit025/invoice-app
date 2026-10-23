import { describe, expect, it } from "vitest";
import { isStoredProActive } from "./pro-access";

describe("device Pro access", () => {
  it("honours the legacy flag only in development", () => {
    expect(isStoredProActive("1", "development")).toBe(true);
    expect(isStoredProActive("1", "production")).toBe(false);
    expect(isStoredProActive("1", "test")).toBe(false);
  });

  it("does not treat a client-side expiry record as Pro", () => {
    const forged = JSON.stringify({
      v: 1,
      active: true,
      plan: "sixMonth",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    expect(isStoredProActive(forged, "development")).toBe(false);
    expect(isStoredProActive(forged, "production")).toBe(false);
    expect(isStoredProActive(null, "development")).toBe(false);
    expect(isStoredProActive("{", "development")).toBe(false);
  });
});
