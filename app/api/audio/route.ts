import type { NextRequest } from "next/server";
import { mediaClass } from "@/lib/server/allowlist";
import { AUDIO_MIME, AudioError, audioFilename, extractAudio, type AudioFormat } from "@/lib/server/audio";
import { getTokenSecret, MisconfiguredError, serverLimits } from "@/lib/server/env";
import { contentDisposition } from "@/lib/server/filename";
import { clientIp } from "@/lib/server/ip";
import { openMedia } from "@/lib/server/media-target";
import { checkRateLimit, rateKey } from "@/lib/server/ratelimit";
import { isCrossSite, jsonError } from "@/lib/server/responses";
import { verifyToken } from "@/lib/server/token";
import { limitStream, UpstreamError } from "@/lib/server/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/audio?t=<signed video token>&f=mp3|m4a
 * Extracts the audio track of an Instagram, TikTok or Pinterest video.
 * Works for every platform because it reuses the same verified media path.
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

  const format = req.nextUrl.searchParams.get("f");
  if (format !== "mp3" && format !== "m4a") return jsonError(400, "INVALID_FORMAT", "Choose mp3 or m4a.");

  const wait = await checkRateLimit(rateKey(clientIp(req.headers), secret, "audio"), limits.audioPerMinute, {
    upstashUrl: limits.upstashUrl,
    upstashToken: limits.upstashToken,
  });
  if (wait) return jsonError(429, "RATE_LIMITED", `Too many conversions. Try again in ${wait}s.`, { "Retry-After": String(wait) });

  const verified = verifyToken(req.nextUrl.searchParams.get("t"), secret);
  if (!verified.ok) {
    return verified.reason === "expired"
      ? jsonError(410, "EXPIRED", "This link expired. Process the post link again.")
      : jsonError(400, "INVALID_TOKEN", "Invalid download link.");
  }
  if (mediaClass(verified.payload.m) !== "video") return jsonError(400, "NOT_A_VIDEO", "Audio can only be extracted from videos.");

  try {
    const upstream = await openMedia(verified.payload, { maxBytes: limits.maxMediaBytes, signal: req.signal });
    const audio = await extractAudio(limitStream(upstream.body, { remaining: limits.maxMediaBytes }), format as AudioFormat, {
      maxOutputBytes: limits.maxMediaBytes,
    });
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": AUDIO_MIME[format as AudioFormat],
        "Content-Length": String(audio.byteLength),
        "Content-Disposition": contentDisposition("attachment", audioFilename(verified.payload.f, format as AudioFormat)),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    if (err instanceof AudioError || err instanceof UpstreamError) return jsonError(err.status, err.code, err.message);
    return jsonError(502, "CONVERSION_FAILED", "We couldn't convert this video to audio. Please try again.");
  }
}
