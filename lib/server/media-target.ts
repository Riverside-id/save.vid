import type { MediaTokenPayload } from "@/lib/types";
import { checkUrl } from "@/lib/url";
import { isAllowedMediaUrl, mediaClass } from "./allowlist";
import { listMedia, loadTikTokSession, TikTokError } from "./tiktok";
import { fetchUpstream, UpstreamError, type UpstreamResult } from "./upstream";

const TIKTOK_STATUS: Record<TikTokError["code"], number> = {
  NOT_FOUND: 410,
  LOGIN_REQUIRED: 403,
  UPSTREAM_BLOCKED: 503,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  NO_MEDIA: 410,
  UNSUPPORTED_URL: 400,
};

async function tiktokTarget(p: MediaTokenPayload, fresh: boolean) {
  const check = checkUrl(p.u);
  if (!check.ok || check.platform !== "tiktok" || check.kind !== "post") throw new UpstreamError(400, "INVALID_TOKEN", "Invalid download link.");
  try {
    const session = await loadTikTokSession(check.canonical, { fresh });
    const media = listMedia(session.item).find((m) => m.key === p.i);
    if (!media) throw new UpstreamError(410, "EXPIRED", "This item is no longer available. Process the post link again.");
    return { url: media.url, referer: session.pageUrl, cookie: session.cookie };
  } catch (err) {
    if (err instanceof TikTokError) throw new UpstreamError(TIKTOK_STATUS[err.code], err.code, err.message);
    throw err;
  }
}

/**
 * Turns a verified token into an upstream stream. TikTok tokens are re-read in
 * their own session; if a cached session's URL was rejected, retry once fresh.
 */
export async function openMedia(
  p: MediaTokenPayload,
  opts: { maxBytes: number; range?: string | null; signal?: AbortSignal },
): Promise<UpstreamResult> {
  const expected = mediaClass(p.m);
  if (!expected) throw new UpstreamError(400, "INVALID_TOKEN", "Invalid download link.");

  if (p.k === "tt") {
    for (const fresh of [false, true]) {
      const target = await tiktokTarget(p, fresh);
      try {
        return await fetchUpstream(target.url, { expected, referer: target.referer, cookie: target.cookie, ...opts });
      } catch (err) {
        if (!(err instanceof UpstreamError && err.code === "EXPIRED" && !fresh)) throw err;
      }
    }
    throw new UpstreamError(410, "EXPIRED", "This file link has expired. Process the post link again.");
  }

  if (!isAllowedMediaUrl(p.u)) throw new UpstreamError(400, "INVALID_TOKEN", "Invalid download link.");
  return fetchUpstream(p.u, { expected, referer: p.r, ...opts });
}
