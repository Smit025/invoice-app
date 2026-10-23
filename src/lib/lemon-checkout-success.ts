export type CheckoutSuccessHints = {
  variantId?: string;
  endsAt?: string;
  renewsAt?: string;
};

function asId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function parseTime(value: string): number | undefined {
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

/** Pull variant and period hints out of a Lemon.js Checkout.Success payload. */
export function readCheckoutSuccess(data: unknown): CheckoutSuccessHints {
  const found: CheckoutSuccessHints = {};
  const seen = new WeakSet<object>();

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const record = node as Record<string, unknown>;
    if (!found.variantId) {
      const variantId = asId(record.variant_id);
      if (variantId) found.variantId = variantId;
    }
    if (!found.endsAt && typeof record.ends_at === "string" && parseTime(record.ends_at)) {
      found.endsAt = record.ends_at;
    }
    if (!found.renewsAt && typeof record.renews_at === "string" && parseTime(record.renews_at)) {
      found.renewsAt = record.renews_at;
    }
    for (const value of Object.values(record)) walk(value, depth + 1);
  };

  walk(data, 0);
  return found;
}
