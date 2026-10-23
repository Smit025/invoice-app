import { describe, expect, it } from "vitest";
import { addBillingPeriod, isStoredProActive, serializeProAccess } from "./pro-access";

describe("device Pro access", () => {
  const now = new Date("2026-01-15T00:00:00.000Z");

  it("ends monthly access after one month and 6-month access after six months", () => {
    expect(addBillingPeriod(now, "monthly")).toBe("2026-02-15T00:00:00.000Z");
    expect(addBillingPeriod(now, "sixMonth")).toBe("2026-07-15T00:00:00.000Z");

    const monthly = serializeProAccess({ plan: "monthly", expiresAt: addBillingPeriod(now, "monthly") });
    expect(isStoredProActive(monthly, now)).toBe(true);
    expect(isStoredProActive(monthly, new Date("2026-02-15T00:00:00.000Z"))).toBe(false);

    const sixMonth = serializeProAccess({ plan: "sixMonth", expiresAt: addBillingPeriod(now, "sixMonth") });
    expect(isStoredProActive(sixMonth, new Date("2026-07-14T23:00:00.000Z"))).toBe(true);
    expect(isStoredProActive(sixMonth, new Date("2026-07-15T00:00:00.000Z"))).toBe(false);
  });

  it("keeps the dev flag and drops inactive or corrupt records", () => {
    expect(isStoredProActive("1", now)).toBe(true);
    expect(isStoredProActive(null, now)).toBe(false);
    expect(isStoredProActive("{", now)).toBe(false);
    expect(isStoredProActive(JSON.stringify({ active: false, expiresAt: "2026-12-01T00:00:00.000Z" }), now)).toBe(
      false,
    );
  });
});
