import type { NextRequest } from "next/server";
import { isAllowedMediaUrl } from "@/lib/server/allowlist";
import { getTokenSecret, MisconfiguredError, serverLimits } from "@/lib/server/env";
import { sanitizeFilename } from "@/lib/server/filename";
import { clientIp } from "@/lib/server/ip";
import { checkRateLimit, rateKey } from "@/lib/server/ratelimit";
import { originMatchesHost } from "@/lib/server/responses";
import { coverUrl, expandShortLink, listMedia, loadTikTokSession, TikTokError } from "@/lib/server/tiktok";
import { signToken } from "@/lib/server/token";
import type { ErrorCode, MediaItem, ResolveFailure, ResolveSuccess } from "@/lib/types";
import { checkUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const STATUS: Partial<Record<ErrorCode, number>> = {
  INVALID_URL: 400,
  UNSUPPORTED_URL: 422,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  LOGIN_REQUIRED: 403,
  UPSTREAM_BLOCKED: 503,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  NO_MEDIA: 422,
  MISCONFIGURED: 500,
};

function fail(code: ErrorCode, message: string, retryAfterSeconds?: number): Response {
  const body: ResolveFailure = { ok: false, error: { code, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } };
  return Response.json(body, {
    status: STATUS[code] ?? 500,
    headers: { "Cache-Control": "no-store", ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}) },
  });
}

/** POST /api/tiktok {"url": "..."} → ResolveResponse (same contract as /api/resolve). */
export async function POST(req: NextRequest): Promise<Response> {
  if (!originMatchesHost(req.headers)) return fail("INVALID_URL", "Cross-origin requests are not allowed.");
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return fail("INVALID_URL", 'Send the link as JSON: {"url": "…"}.');
  }

  let secret: string;
  try {
    secret = getTokenSecret();
  } catch (err) {
    if (err instanceof MisconfiguredError) return fail("MISCONFIGURED", "Server is missing its MEDIA_TOKEN_SECRET.");
    throw err;
  }
  const limits = serverLimits();
  const wait = await checkRateLimit(rateKey(clientIp(req.headers), secret, "resolve"), limits.resolvePerMinute, {
    upstashUrl: limits.upstashUrl,
    upstashToken: limits.upstashToken,
  });
  if (wait) return fail("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", wait);

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > 4096) return fail("INVALID_URL", "Request body is too large.");
    raw = (JSON.parse(text) as { url?: unknown })?.url;
  } catch {
    return fail("INVALID_URL", "Request body is not valid JSON.");
  }
  if (typeof raw !== "string") return fail("INVALID_URL", "Paste a link to a TikTok post.");

  const check = checkUrl(raw);
  if (!check.ok) return fail(check.reason === "unsupported-host" || check.reason === "unsupported-path" ? "UNSUPPORTED_URL" : "INVALID_URL", check.message);
  if (check.platform !== "tiktok") return fail("UNSUPPORTED_URL", "This endpoint only handles TikTok links.");

  try {
    const postUrl = check.kind === "short-link" ? await expandShortLink(check.canonical) : check.canonical;
    const session = await loadTikTokSession(postUrl, { fresh: true });
    const { item } = session;
    const media = listMedia(item);
    if (media.length === 0) return fail("NO_MEDIA", "We couldn't find a watermark-free video or photo in this TikTok post.");

    const exp = Math.floor(Date.now() / 1000) + limits.tokenTtlSeconds;
    const username = item.author?.uniqueId ?? null;
    const id = item.id ?? postUrl.split("/").pop() ?? "post";
    const multi = media.length > 1;
    const cover = coverUrl(item);
    const coverToken =
      cover && isAllowedMediaUrl(cover)
        ? signToken(secret, { v: 1, u: cover, r: "https://www.tiktok.com/", f: "cover.jpg", m: "image/jpeg", x: exp })
        : null;

    const items: MediaItem[] = media.map((m, index) => {
      const filename = sanitizeFilename(
        ["socialsaver", "tiktok", username, id, multi ? String(index + 1) : null].filter(Boolean).join("_") + `.${m.ext}`,
      );
      const token = signToken(secret, { v: 1, k: "tt", u: postUrl, i: m.key, r: null, f: filename, m: m.mime, x: exp });
      const size = m.width && m.height ? `${m.width}×${m.height}` : "Full size";
      return {
        index,
        kind: m.kind,
        width: m.width,
        height: m.height,
        durationSeconds: m.kind === "video" && typeof item.video?.duration === "number" ? item.video.duration : null,
        previewToken: m.kind === "image" ? token : coverToken,
        variants: [
          {
            id: m.key,
            label: `${m.ext.toUpperCase()} · ${size}`,
            ext: m.ext,
            mime: m.mime,
            width: m.width,
            height: m.height,
            hasAudio: null,
            note:
              m.kind === "video"
                ? "Watermark-free source from TikTok — no TikTok overlay added. Logos that are part of the original upload stay."
                : "Full-size photo, exactly as TikTok serves it.",
            filename,
            token,
          },
        ],
      };
    });

    const body: ResolveSuccess = {
      ok: true,
      platform: "tiktok",
      sourceUrl: postUrl,
      postType: multi ? "carousel" : media[0]!.kind,
      author: { username, displayName: item.author?.nickname ?? null },
      caption: item.desc?.trim().slice(0, 600) || null,
      downloadable: true,
      notice: null,
      items,
      extractor: { name: "tiktok-web", version: null },
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof TikTokError) return fail(err.code, err.message);
    return fail("UPSTREAM_ERROR", "Something went wrong while reading this TikTok post. Please try again.");
  }
}
