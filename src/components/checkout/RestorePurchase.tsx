"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { publishEntitlement, type EntitlementSnapshot } from "@/lib/entitlement-client";
import { getOrCreateInstallId, markCheckoutStarted } from "@/lib/install-id";

export function RestorePurchase() {
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      markCheckoutStarted();
      const response = await fetch("/api/entitlement/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Install-Id": getOrCreateInstallId(),
        },
        body: JSON.stringify({ email, orderId }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object") {
        const error =
          body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "That receipt doesn't match a paid subscription.";
        setMessage(error);
        return;
      }
      const status = (body as { status?: unknown }).status;
      if (status !== "active" && status !== "inactive" && status !== "not_found") {
        setMessage("That receipt doesn't match a paid subscription.");
        return;
      }
      const snapshot: EntitlementSnapshot = {
        status,
        plan:
          (body as { plan?: unknown }).plan === "monthly" || (body as { plan?: unknown }).plan === "sixMonth"
            ? ((body as { plan: "monthly" | "sixMonth" }).plan)
            : null,
        endsAt: typeof (body as { endsAt?: unknown }).endsAt === "string" ? (body as { endsAt: string }).endsAt : null,
        renewsAt:
          typeof (body as { renewsAt?: unknown }).renewsAt === "string"
            ? (body as { renewsAt: string }).renewsAt
            : null,
      };
      publishEntitlement(snapshot);
      setMessage(status === "active" ? "Pro is restored on this device." : "That subscription is not active.");
    } catch {
      setMessage("Could not reach the receipt check. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-8 w-full max-w-sm space-y-3 text-left">
      <p className="text-sm leading-5 text-muted">
        Already paid on another browser? Restore with the email and order number from your receipt.
      </p>
      <Input
        type="email"
        name="email"
        autoComplete="email"
        required
        placeholder="Email on the receipt"
        aria-label="Email on the receipt"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        name="orderId"
        required
        placeholder="Order number"
        aria-label="Order number"
        value={orderId}
        onChange={(event) => setOrderId(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={pending} className="w-full">
        {pending ? "Checking receipt…" : "Restore purchase"}
      </Button>
      {message ? <p className="text-sm leading-5 text-muted">{message}</p> : null}
    </form>
  );
}
