import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_STARTED_KEY, createInstallId, getOrCreateInstallId, INSTALL_ID_KEY, isInstallUserId, markCheckoutStarted, hasCheckoutStarted } from "./install-id";

function storage() {
  const map = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
  vi.stubGlobal("window", { localStorage });
  return map;
}

describe("install id", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("draws 16 bytes from getRandomValues and encodes them as hex", () => {
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation((bytes) => {
      const view = bytes as Uint8Array;
      view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      return bytes;
    });
    expect(createInstallId()).toBe("0102030405060708090a0b0c0d0e0f10");
    expect((spy.mock.calls[0]?.[0] as Uint8Array).length).toBe(16);
    expect(isInstallUserId("11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("replaces a stored UUID once and then keeps the new id", () => {
    const map = storage();
    map.set(INSTALL_ID_KEY, "11111111-1111-4111-8111-111111111111");
    const created = getOrCreateInstallId();
    expect(isInstallUserId(created)).toBe(true);
    expect(created).not.toContain("-");
    expect(getOrCreateInstallId()).toBe(created);
    expect(map.get(INSTALL_ID_KEY)).toBe(created);
  });

  it("remembers that checkout started", () => {
    const map = storage();
    expect(hasCheckoutStarted()).toBe(false);
    markCheckoutStarted();
    expect(map.get(CHECKOUT_STARTED_KEY)).toBe("1");
    expect(hasCheckoutStarted()).toBe(true);
  });
});
