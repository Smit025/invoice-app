const ENV_PATTERN = /[^a-z0-9_-]/g;

/**
 * Preview and production must not share Upstash keys. Vercel sets VERCEL_ENV
 * to `production`, `preview`, or `development`. Local runs and tests use `local`.
 */
export function entitlementKeyPrefix(env: string | undefined = process.env.VERCEL_ENV): string {
  const safe = (env ?? "").trim().toLowerCase().replace(ENV_PATTERN, "").slice(0, 32);
  return `inv:${safe || "local"}:`;
}
