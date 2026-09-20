import { describe, expect, it } from "vitest";
import { isAllowedLogoFile } from "./logo";

describe("isAllowedLogoFile", () => {
  it("allows png, jpeg, and webp under 2MB", () => {
    expect(isAllowedLogoFile({ type: "image/png", size: 100 })).toBeNull();
    expect(isAllowedLogoFile({ type: "image/jpeg", size: 100 })).toBeNull();
    expect(isAllowedLogoFile({ type: "image/webp", size: 100 })).toBeNull();
  });

  it("rejects svg, gif, and oversized files", () => {
    expect(isAllowedLogoFile({ type: "image/svg+xml", size: 100 })).toMatch(/PNG/);
    expect(isAllowedLogoFile({ type: "image/gif", size: 100 })).toMatch(/PNG/);
    expect(isAllowedLogoFile({ type: "image/png", size: 3 * 1024 * 1024 })).toMatch(/2MB/);
  });
});
