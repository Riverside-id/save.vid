import type { NextRequest } from "next/server";
import { mediaClass } from "@/lib/server/allowlist";
import { getTokenSecret, MisconfiguredError, serverLimits } from "@/lib/server/env";
import { contentDisposition } from "@/lib/server/filename";
import { clientIp } from "@/lib/server/ip";
import { checkRateLimit, rateKey } from "@/lib/server/ratelimit";
import { isCrossSite, jsonError } from "@/lib/server/responses";
import { verifyToken } from "@/lib/server/token";
import { openMedia } from "@/lib/server/media-target";
import { limitStream, sanitizeRange, UpstreamError } from "@/lib/server/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/media?t=<signed token>[&dl=1]
 * Streams one media file from an allowlisted CDN. Nothing is buffered or stored.
 */
export async function GET(req: NextRequest): Promise<Response> {
  if (isCrossSite(req.headers)) return jsonError(403, "FORBIDDEN", "Hotlinking is not allowed.");

  let secret: string;
  try {
    secret = getTokenSecret();
  } catch (err) {
    if (err instanceof MisconfiguredError) return jsonError(500, "MISCONFIGURED", "Server is not configured.");
    throw err;
  }
  const limits = serverLimits();

  const wait = await checkRateLimit(rateKey(clientIp(req.headers), secret, "media"), limits.mediaPerMinute, {
    upstashUrl: limits.upstashUrl,
    upstashToken: limits.upstashToken,
  });
  if (wait) return jsonError(429, "RATE_LIMITED", "Too many requests. Please slow down.", { "Retry-After": String(wait) });

  const verified = verifyToken(req.nextUrl.searchParams.get("t"), secret);
  if (!verified.ok) {
    return verified.reason === "expired"
      ? jsonError(410, "EXPIRED", "This download link expired. Process the post link again.")
      : jsonError(400, "INVALID_TOKEN", "Invalid download link.");
  }
  const { f: filename, m: mime } = verified.payload;
  const expected = mediaClass(mime);
  if (!expected) return jsonError(400, "INVALID_TOKEN", "Invalid download link.");

  const download = req.nextUrl.searchParams.get("dl") === "1";
  const range = sanitizeRange(req.headers.get("range"));

  try {
    const upstream = await openMedia(verified.payload, { range, maxBytes: limits.maxMediaBytes, signal: req.signal });
    const headers = new Headers({
      "Content-Type": upstream.contentType.startsWith(`${expected}/`) ? upstream.contentType : mime,
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", filename),
      "Cache-Control": download ? "private, no-store" : "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      // Range requests are passed through to the CDN (verified to support them), which video seeking relies on.
      "Accept-Ranges": expected === "video" || upstream.response.headers.get("accept-ranges") === "bytes" ? "bytes" : "none",
    });
    if (upstream.contentLength !== null) headers.set("Content-Length", String(upstream.contentLength));
    const contentRange = upstream.response.headers.get("content-range");
    if (upstream.response.status === 206 && contentRange) headers.set("Content-Range", contentRange);

    return new Response(limitStream(upstream.body, { remaining: limits.maxMediaBytes }), {
      status: upstream.response.status,
      headers,
    });
  } catch (err) {
    if (err instanceof UpstreamError) return jsonError(err.status, err.code, err.message);
    return jsonError(502, "UPSTREAM_ERROR", "Could not fetch this file. Please try again.");
  }
}
