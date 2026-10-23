"use client";

import { useEffect, useState } from "react";
import { ENTITLEMENT_EVENT, readEntitlementSnapshot, type EntitlementSnapshot } from "@/lib/entitlement-client";

function formatUntil(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(time));
}

export function ThanksStatus() {
  const [snapshot, setSnapshot] = useState<EntitlementSnapshot | null>(null);

  useEffect(() => {
    const onEntitlement = (event: Event) => {
      const next = readEntitlementSnapshot(event);
      if (next) setSnapshot(next);
    };
    window.addEventListener(ENTITLEMENT_EVENT, onEntitlement);
    return () => window.removeEventListener(ENTITLEMENT_EVENT, onEntitlement);
  }, []);

  if (snapshot?.status === "active") {
    const until = formatUntil(snapshot.endsAt ?? snapshot.renewsAt);
    return (
      <p className="mt-2 max-w-md text-sm leading-5 text-muted">
        Pro is active on this device{until ? ` until ${until}` : ""}.
      </p>
    );
  }

  return (
    <p className="mt-2 max-w-md text-sm leading-5 text-muted">
      Waiting for Lemon to confirm the subscription. Pro is added on this device only after that
      confirmation.
    </p>
  );
}
