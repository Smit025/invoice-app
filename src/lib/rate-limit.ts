type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** In-memory fixed window. This does not call Redis. */
export function takeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  if (buckets.size > 5000) {
    for (const [bucketKey, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(bucketKey);
    }
  }
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

/** Thanks-page burst is 5s × 3 min = 36 reads. Leave a little room, then stop. */
export const ENTITLEMENT_ID_LIMIT = 48;
export const ENTITLEMENT_ID_WINDOW_MS = 3 * 60 * 1000;
export const ENTITLEMENT_IP_LIMIT = 120;
export const ENTITLEMENT_IP_WINDOW_MS = 60 * 1000;

export const RESTORE_LIMIT = 8;
export const RESTORE_WINDOW_MS = 60 * 60 * 1000;
