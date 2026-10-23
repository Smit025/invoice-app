import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { LEMON_VARIANT_IDS } from "@/lib/lemon-config";
import { POST } from "./route";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function signed(secret: string, body: string) {
  return new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
    method: "POST",
    body,
    headers: { "X-Signature": sign(body, secret) },
  });
}

describe("POST /api/webhooks/lemonsqueezy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when the webhook secret is missing", async () => {
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", "");
    const request = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });

  it("returns 400 for an invalid signature and does not grant Pro for order_created", async () => {
    const secret = "whsec_test";
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", secret);
    const body = JSON.stringify({
      meta: { event_name: "order_created" },
      data: {
        id: "ord_1",
        type: "orders",
        attributes: { first_order_item: { variant_id: Number(LEMON_VARIANT_IDS.sixMonth) } },
      },
    });

    const bad = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body,
      headers: { "X-Signature": sign(body, "nope") },
    });
    expect((await POST(bad)).status).toBe(400);

    const response = await POST(signed(secret, body));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      license: { action: "ignore", active: false, event: "order_created" },
    });
  });

  it("revokes Pro when either subscription expires", async () => {
    const secret = "whsec_test";
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", secret);

    for (const variantId of [LEMON_VARIANT_IDS.monthly, LEMON_VARIANT_IDS.sixMonth]) {
      const body = JSON.stringify({
        meta: { event_name: "subscription_expired" },
        data: {
          type: "subscriptions",
          id: `sub_${variantId}`,
          attributes: { variant_id: Number(variantId), status: "expired", ends_at: "2026-10-23T00:00:00.000Z" },
        },
      });
      const response = await POST(signed(secret, body));
      expect(response.status).toBe(200);
      const json = (await response.json()) as { license: { active: boolean; action: string; variantId: string } };
      expect(json.license).toMatchObject({ action: "revoke", active: false, variantId });
    }
  });
});
