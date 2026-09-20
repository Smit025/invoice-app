import { describe, expect, it } from "vitest";
import { isAllowedLogoDataUrl, isAllowedLogoFile } from "./logo";

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

describe("isAllowedLogoDataUrl", () => {
  it("allows png/jpeg/webp base64 data URLs", () => {
    expect(isAllowedLogoDataUrl("data:image/png;base64,abc")).toBe(true);
    expect(isAllowedLogoDataUrl("data:image/jpeg;base64,abc")).toBe(true);
    expect(isAllowedLogoDataUrl("data:image/webp;base64,abc")).toBe(true);
  });

  it("rejects svg, gif, and non-data URLs", () => {
    expect(isAllowedLogoDataUrl("data:image/svg+xml;base64,PHN2Zw==")).toBe(false);
    expect(isAllowedLogoDataUrl("data:image/gif;base64,R0lG")).toBe(false);
    expect(isAllowedLogoDataUrl("https://example.com/logo.png")).toBe(false);
  });
});
