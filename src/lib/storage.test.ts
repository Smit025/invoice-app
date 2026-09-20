import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY } from "./constants";
import { parseDraftStore, writeDraftStore } from "./storage";

describe("parseDraftStore", () => {
  it("returns a default store for null / invalid JSON", () => {
    const empty = parseDraftStore(null);
    expect(empty.drafts).toHaveLength(1);
    expect(empty.drafts[0].from.name).toBe("");
    expect(empty.drafts[0].items).toHaveLength(1);

    const junk = parseDraftStore("{not json");
    expect(junk.drafts[0].items.map((item) => item.description)).toEqual([""]);
  });

  it("merges a partial invoice onto createDefaultInvoice so from.name / items.map are safe", () => {
    const store = parseDraftStore(JSON.stringify({ id: "x", number: "INV-9" }));
    const inv = store.drafts[0];
    expect(inv.id).toBe("x");
    expect(inv.number).toBe("INV-9");
    expect(inv.from.name).toBe("");
    expect(inv.to.country).toBe("US");
    expect(Array.isArray(inv.items)).toBe(true);
    expect(inv.items.map((item) => item.qty).length).toBeGreaterThan(0);
    expect(inv.taxMode).toBe("none");
  });

  it("hydrates a v1 envelope with a corrupt draft object", () => {
    const store = parseDraftStore(
      JSON.stringify({
        v: 1,
        currentId: "gone",
        drafts: [{ from: { name: "Acme" } }, null, "nope"],
      }),
    );
    expect(store.drafts.length).toBeGreaterThan(0);
    expect(store.drafts[0].from.name).toBe("Acme");
    expect(store.drafts[0].items.map((item) => item.id).length).toBeGreaterThan(0);
  });

  it("does not crash when from/items are missing or the wrong type", () => {
    const store = parseDraftStore(
      JSON.stringify({
        v: 1,
        currentId: "z",
        drafts: [{ id: "z", from: null, to: 3, items: "nope", taxRate: -8 }],
      }),
    );
    const inv = store.drafts[0];
    expect(inv.from.name).toBe("");
    expect(inv.to.country).toBe("US");
    expect(inv.items.map((item) => item.qty)).toHaveLength(1);
    expect(inv.taxRate).toBe(0);
  });

  it("drops svg/gif logo data URLs", () => {
    const store = parseDraftStore(
      JSON.stringify({
        id: "logo",
        logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      }),
    );
    expect(store.drafts[0].logoDataUrl).toBeUndefined();
  });
});

describe("writeDraftStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries without logos on QuotaExceededError", () => {
    const setItem = vi
      .fn()
      .mockImplementationOnce(() => {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      })
      .mockImplementation(() => undefined);

    vi.stubGlobal("window", {
      localStorage: { setItem, getItem: vi.fn(), removeItem: vi.fn() },
    });

    writeDraftStore(
      {
        v: 1,
        currentId: "a",
        drafts: [
          {
            id: "a",
            number: "INV-1",
            issueDate: "2026-01-01",
            dueDate: "2026-01-15",
            locale: "en-US",
            currency: "USD",
            from: {
              name: "A",
              address1: "",
              city: "",
              region: "",
              postal: "",
              country: "US",
            },
            to: {
              name: "B",
              address1: "",
              city: "",
              region: "",
              postal: "",
              country: "US",
            },
            items: [{ id: "i", description: "", qty: 1, rate: 0, amount: 0 }],
            taxMode: "none",
            taxRate: 0,
            templateId: "classic",
            theme: "light",
            logoDataUrl: "data:image/jpeg;base64,abc",
          },
        ],
      },
      true,
    );

    expect(setItem).toHaveBeenCalledTimes(2);
    expect(setItem.mock.calls[0][0]).toBe(DRAFT_KEY);
    const stripped = JSON.parse(String(setItem.mock.calls[1][1]));
    expect(stripped.drafts[0].logoDataUrl).toBeUndefined();
  });
});
