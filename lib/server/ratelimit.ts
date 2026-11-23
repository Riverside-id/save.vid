import { createHash } from "node:crypto";

/**
 * Same strategy as api/_lib/ratelimit.py: Upstash Redis (shared) when configured,
 * otherwise an in-memory sliding window per function instance (best effort).
 */

const hits = new Map<string, number[]>();
const MAX_KEYS = 10_000;

export function rateKey(ip: string, secret: string, scope: string): string {
  const digest = createHash("sha256").update(`${secret}|${ip}`).digest("hex").slice(0, 20);
  return `rl:${scope}:${digest}`;
}

function memoryCheck(key: string, limit: number, windowMs: number, now: number): number | null {
  if (hits.size > MAX_KEYS) hits.clear();
  const arr = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return Math.max(1, Math.ceil((arr[0]! + windowMs - now) / 1000));
  }
  arr.push(now);
  hits.set(key, arr);
  return null;
}

async function upstashCheck(url: string, token: string, key: string, limit: number, windowSec: number, now: number): Promise<number | null> {
  const bucket = Math.floor(now / 1000 / windowSec);
  const redisKey = `${key}:${bucket}`;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowSec * 2)],
    ]),
    signal: AbortSignal.timeout(2000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result: number }>;
  const count = Number(data[0]?.result ?? 0);
  return count > limit ? Math.max(1, Math.ceil((bucket + 1) * windowSec - now / 1000)) : null;
}

/** Returns null when allowed, otherwise seconds to wait. */
export async function checkRateLimit(
  key: string,
  limit: number,
  opts: { windowSec?: number; upstashUrl?: string; upstashToken?: string; now?: number } = {},
): Promise<number | null> {
  const windowSec = opts.windowSec ?? 60;
  const now = opts.now ?? Date.now();
  if (opts.upstashUrl && opts.upstashToken) {
    try {
      return await upstashCheck(opts.upstashUrl, opts.upstashToken, key, limit, windowSec, now);
    } catch {
      /* degrade to the local limiter */
    }
  }
  return memoryCheck(key, limit, windowSec * 1000, now);
}

export function resetRateLimiter(): void {
  hits.clear();
}
