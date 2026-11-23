import { createHmac, timingSafeEqual } from "node:crypto";
import type { MediaTokenPayload } from "@/lib/types";

/** Mirrors api/_lib/tokens.py. Format: b64url(json) "." b64url(hmac_sha256(secret, b64url(json))) */

export type TokenResult = { ok: true; payload: MediaTokenPayload } | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "invalid-payload" };

const MAX_TOKEN_LENGTH = 8192;

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** Used by tests (and available for future server-side signing). */
export function signToken(secret: string, payload: MediaTokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(sortKeys(payload)), "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function isPayload(p: unknown): p is MediaTokenPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    o.v === 1 &&
    typeof o.u === "string" &&
    (o.r === null || typeof o.r === "string") &&
    typeof o.f === "string" &&
    typeof o.m === "string" &&
    typeof o.x === "number" &&
    Number.isFinite(o.x)
  );
}

export function verifyToken(token: string | null | undefined, secret: string, nowSeconds = Date.now() / 1000): TokenResult {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts as [string, string];
  if (!/^[A-Za-z0-9_-]+$/.test(body) || !/^[A-Za-z0-9_-]+$/.test(sig)) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad-signature" };

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid-payload" };
  }
  if (!isPayload(payload)) return { ok: false, reason: "invalid-payload" };
  if (payload.x <= nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
