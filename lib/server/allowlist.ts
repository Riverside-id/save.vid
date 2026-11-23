/** Media CDN allowlist — mirrors `is_allowed_media_url` in api/_lib/urls.py. */
const MEDIA_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net", ".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com", ".pinimg.com"];

/**
 * TikTok serves web video files from hosts like v16-webapp-prime.tiktok.com,
 * or regional variants such as v19-webapp-prime.us.tiktok.com.
 */
const TIKTOK_VIDEO_HOST = /^v\d{1,3}[a-z0-9-]*(?:\.[a-z]{2,3})?\.tiktok\.com$/;
/** TikTok's official play endpoint (redirects to the CDN; each hop is re-validated). */
const TIKTOK_PLAY_PATH = /^\/aweme\/v1\/play\/?$/;

export function isAllowedMediaUrl(raw: string): boolean {
  if (typeof raw !== "string" || raw.length > 4096) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  // reject IP literals outright (the CDN is always addressed by name)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false;
  if (TIKTOK_VIDEO_HOST.test(host)) return true;
  if (host === "www.tiktok.com" && TIKTOK_PLAY_PATH.test(url.pathname)) return true;
  return MEDIA_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx) && host.length > sfx.length);
}

/** The broad media class we expect for a token MIME type. */
export function mediaClass(mime: string): "video" | "image" | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return null;
}
