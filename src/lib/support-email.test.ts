import { describe, expect, it } from "vitest";
import { readSupportEmail, recoveryCopy } from "./support-email";

describe("support email", () => {
  it("hides recovery copy when the address is unset", () => {
    expect(readSupportEmail(undefined)).toBeNull();
    expect(readSupportEmail("")).toBeNull();
    expect(readSupportEmail("not-an-email")).toBeNull();
  });

  it("uses the configured address in the recovery line", () => {
    expect(readSupportEmail("  help@example.com  ")).toBe("help@example.com");
    expect(recoveryCopy("help@example.com")).toBe(
      "Pro is saved in this browser. If Pro disappears, email help@example.com with your Lemon Squeezy receipt and we'll restore it.",
    );
  });
});
