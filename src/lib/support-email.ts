const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

/** The public support address, or null when it is unset or not an email. */
export function readSupportEmail(value: string | undefined | null): string | null {
  const email = value?.trim() ?? "";
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function recoveryCopy(email: string): string {
  return `Pro is saved in this browser. If Pro disappears, email ${email} with your Lemon Squeezy receipt and we'll restore it.`;
}
