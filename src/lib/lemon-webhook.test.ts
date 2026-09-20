import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getLemonEventName,
  isLemonEntitlementEvent,
  summarizeLemonWebhook,
  verifyLemonSignature,
} from "./lemon-webhook";

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyLemonSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ meta: { event_name: "order_created" }, data: { id: "1" } });

  it("accepts a matching HMAC hex digest", () => {
    expect(verifyLemonSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a bad signature, empty header, or empty body", () => {
    expect(verifyLemonSignature(body, sign(body, "other"), secret)).toBe(false);
    expect(verifyLemonSignature(body, "", secret)).toBe(false);
    expect(verifyLemonSignature(body, null, secret)).toBe(false);
    expect(verifyLemonSignature("", sign("", secret), secret)).toBe(false);
    expect(verifyLemonSignature(body, sign(body, secret), "")).toBe(false);
  });

  it("rejects signatures with a different hex length", () => {
    expect(verifyLemonSignature(body, "ab", secret)).toBe(false);
  });
});

describe("webhook payload helpers", () => {
  it("reads meta.event_name and a short summary without extra fields", () => {
    const payload = {
      meta: { event_name: "license_key_created" },
      data: { id: "99", type: "license-keys", attributes: { user_email: "hidden@example.com" } },
    };
    expect(getLemonEventName(payload)).toBe("license_key_created");
    expect(isLemonEntitlementEvent("license_key_created")).toBe(true);
    expect(isLemonEntitlementEvent("order_created")).toBe(true);
    expect(isLemonEntitlementEvent("subscription_cancelled")).toBe(false);
    expect(summarizeLemonWebhook(payload)).toEqual({
      event: "license_key_created",
      id: "99",
      type: "license-keys",
    });
  });

  it("returns undefined for malformed payloads", () => {
    expect(getLemonEventName(null)).toBeUndefined();
    expect(getLemonEventName({ meta: { event_name: 3 } })).toBeUndefined();
    expect(summarizeLemonWebhook("nope")).toEqual({
      event: undefined,
      id: undefined,
      type: undefined,
    });
  });
});
