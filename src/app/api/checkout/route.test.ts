import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
  DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
} from "@/lib/lemon-config";
import { GET, POST } from "./route";

describe("/api/checkout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GET reports both live buy links", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sixMonth: true, monthly: true });
  });

  it("POST rejects an unknown plan", async () => {
    const request = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "yearly" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("POST returns the live buy links and does not create a Lemon cart", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    vi.stubEnv("LEMONSQUEEZY_CHECKOUT_URL", "");
    vi.stubEnv("LEMONSQUEEZY_CHECKOUT_URL_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL", "");
    vi.stubEnv("NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_CHECKOUT_URL", "");

    const sixMonth = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "sixMonth" }),
      headers: { "Content-Type": "application/json" },
    });
    const monthly = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "monthly" }),
      headers: { "Content-Type": "application/json" },
    });

    const sixResponse = await POST(sixMonth);
    expect(sixResponse.status).toBe(200);
    await expect(sixResponse.json()).resolves.toEqual({
      url: DEFAULT_LEMONSQUEEZY_CHECKOUT_URL,
    });
    await expect((await POST(monthly)).json()).resolves.toEqual({
      url: DEFAULT_LEMONSQUEEZY_CHECKOUT_URL_MONTHLY,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POST prefers LEMONSQUEEZY_CHECKOUT_URL when it is a live buy link", async () => {
    const override = "https://store.lemonsqueezy.com/checkout/buy/override-six";
    vi.stubEnv("LEMONSQUEEZY_CHECKOUT_URL", override);
    const request = new NextRequest("http://localhost/api/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "sixMonth" }),
      headers: { "Content-Type": "application/json" },
    });
    await expect((await POST(request)).json()).resolves.toEqual({ url: override });
  });
});
