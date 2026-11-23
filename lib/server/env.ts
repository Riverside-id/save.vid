function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export class MisconfiguredError extends Error {}

export function getTokenSecret(): string {
  const secret = process.env.MEDIA_TOKEN_SECRET?.trim() ?? "";
  if (secret.length < 32) throw new MisconfiguredError("MEDIA_TOKEN_SECRET must be set (32+ characters)");
  return secret;
}

export function serverLimits() {
  return {
    tokenTtlSeconds: int("MEDIA_TOKEN_TTL_SECONDS", 3600, 60, 6 * 3600),
    resolvePerMinute: int("RATE_LIMIT_RESOLVE_PER_MIN", 10, 1, 600),
    maxMediaBytes: int("MAX_MEDIA_MB", 250, 1, 2048) * 1024 * 1024,
    maxZipBytes: int("MAX_ZIP_MB", 300, 1, 4096) * 1024 * 1024,
    maxZipItems: int("MAX_ZIP_ITEMS", 20, 1, 100),
    mediaPerMinute: int("RATE_LIMIT_MEDIA_PER_MIN", 120, 1, 6000),
    zipPerMinute: int("RATE_LIMIT_ZIP_PER_MIN", 6, 1, 600),
    upstashUrl: (process.env.UPSTASH_REDIS_REST_URL ?? "").trim().replace(/\/+$/, ""),
    upstashToken: (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim(),
  };
}
