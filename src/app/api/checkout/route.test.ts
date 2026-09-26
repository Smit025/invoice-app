import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("/api/checkout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET reports which plans the API can create", async () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "key");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "1");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID", "10");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID_MONTHLY", "");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID_YEARLY", "");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ monthly: true, yearly: false });
  });

  it("GET reports yearly when the yearly subscription variant is set", async () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "key");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "1");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID_MONTHLY", "10");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID_YEARLY", "11");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ monthly: true, yearly: true });
  });

  it("POST rejects an unknown plan", async () => {
    const request = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "lifetime" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("POST returns 503 when API checkout is not configured", async () => {
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "");
    vi.stubEnv("LEMONSQUEEZY_STORE_ID", "");
    vi.stubEnv("LEMONSQUEEZY_VARIANT_ID", "");
    const request = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "monthly" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(503);
  });
});
