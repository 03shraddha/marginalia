/**
 * A small in-memory limiter for the shared house key. Visitors who bring
 * their own key are never limited: they pay for their own runs. Per server
 * instance only, which is enough for a demo; swap in Upstash for production.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function clientId(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}
