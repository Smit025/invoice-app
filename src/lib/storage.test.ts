import { describe, expect, it } from "vitest";
import { parseDraftStore } from "./storage";

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
});
