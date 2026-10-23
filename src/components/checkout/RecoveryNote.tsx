"use client";

import { readSupportEmail, recoveryCopy } from "@/lib/support-email";

export function RecoveryNote({ className }: { className?: string }) {
  const email = readSupportEmail(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
  if (!email) return null;
  const [before, after] = recoveryCopy(email).split(email);
  return (
    <p className={className}>
      {before}
      <a className="underline" href={`mailto:${email}`}>
        {email}
      </a>
      {after}
    </p>
  );
}
