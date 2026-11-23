/** Media CDN allowlist — mirrors `is_allowed_media_url` in api/_lib/urls.py. */
const MEDIA_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net", ".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com"];

/** TikTok serves web video files from hosts like v16-webapp-prime.tiktok.com. */
const TIKTOK_VIDEO_HOST = /^v\d{1,3}[a-z0-9-]*\.tiktok\.com$/;

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
  return MEDIA_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx) && host.length > sfx.length);
}

/** The broad media class we expect for a token MIME type. */
export function mediaClass(mime: string): "video" | "image" | null {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return null;
}
