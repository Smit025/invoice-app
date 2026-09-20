import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
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

  it("returns 400 for an invalid signature and 200 for order_created", async () => {
    const secret = "whsec_test";
    vi.stubEnv("LEMONSQUEEZY_WEBHOOK_SECRET", secret);
    const body = JSON.stringify({
      meta: { event_name: "order_created" },
      data: { id: "ord_1", type: "orders" },
    });

    const bad = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body,
      headers: { "X-Signature": sign(body, "nope") },
    });
    expect((await POST(bad)).status).toBe(400);

    const ok = new NextRequest("http://localhost/api/webhooks/lemonsqueezy", {
      method: "POST",
      body,
      headers: { "X-Signature": sign(body, secret) },
    });
    const response = await POST(ok);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
