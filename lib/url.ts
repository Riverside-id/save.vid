import type { Platform } from "./types";

/**
 * Client-side URL validation. It mirrors `api/_lib/urls.py` so users get
 * instant feedback, but the Python resolver is the authority: everything is
 * validated again on the server.
 */

export const MAX_URL_LENGTH = 2048;

const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
  "www.instagr.am",
]);

const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com"]);
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"]);

const IG_SHORTCODE = "[A-Za-z0-9_-]{5,64}";
const IG_POST_RE = new RegExp(`^/(?:[A-Za-z0-9._]{1,30}/)?(p|reel|reels|tv)/(${IG_SHORTCODE})/?$`);
const TT_ITEM_RE = /^\/@([A-Za-z0-9._-]{1,64})\/(video|photo)\/(\d{6,25})\/?$/;
const TT_SHORT_RE = /^\/(?:t\/)?([A-Za-z0-9]{5,20})\/?$/;

export type UrlCheck =
  | { ok: true; platform: Platform; kind: "post" | "short-link"; canonical: string }
  | { ok: false; reason: "empty" | "too-long" | "invalid" | "unsupported-host" | "unsupported-path"; message: string };

export function detectPlatform(input: string): Platform | null {
  const parsed = parseLoose(input);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  if (INSTAGRAM_HOSTS.has(host)) return "instagram";
  if (TIKTOK_HOSTS.has(host) || TIKTOK_SHORT_HOSTS.has(host)) return "tiktok";
  return null;
}

/** Accepts "instagram.com/p/xyz" (no scheme) as a convenience. */
function parseLoose(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

export function checkUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: "empty", message: "Paste a link to an Instagram or TikTok post." };
  if (trimmed.length > MAX_URL_LENGTH) return { ok: false, reason: "too-long", message: "That link is too long." };

  const url = parseLoose(trimmed);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return { ok: false, reason: "invalid", message: "That doesn't look like a valid web link." };
  }
  if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) {
    return { ok: false, reason: "invalid", message: "Links with credentials or custom ports are not allowed." };
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/{2,}/g, "/");

  if (INSTAGRAM_HOSTS.has(host)) {
    const m = IG_POST_RE.exec(path);
    if (!m) {
      return {
        ok: false,
        reason: "unsupported-path",
        message: "Use a link to a single Instagram post, reel or video. Profiles and stories are not supported.",
      };
    }
    const type = m[1] === "reels" ? "reel" : (m[1] as string);
    return { ok: true, platform: "instagram", kind: "post", canonical: `https://www.instagram.com/${type}/${m[2]}/` };
  }

  if (TIKTOK_HOSTS.has(host)) {
    const m = TT_ITEM_RE.exec(path);
    if (m) {
      return { ok: true, platform: "tiktok", kind: "post", canonical: `https://www.tiktok.com/@${m[1]}/${m[2]}/${m[3]}` };
    }
    const s = /^\/t\/([A-Za-z0-9]{5,20})\/?$/.exec(path);
    if (s) return { ok: true, platform: "tiktok", kind: "short-link", canonical: `https://www.tiktok.com/t/${s[1]}/` };
    return {
      ok: false,
      reason: "unsupported-path",
      message: "Use a link to a single TikTok video or photo post.",
    };
  }

  if (TIKTOK_SHORT_HOSTS.has(host)) {
    const s = TT_SHORT_RE.exec(path);
    if (s) return { ok: true, platform: "tiktok", kind: "short-link", canonical: `https://${host}/${s[1]}/` };
    return { ok: false, reason: "unsupported-path", message: "That TikTok short link looks incomplete." };
  }

  return { ok: false, reason: "unsupported-host", message: "Only instagram.com and tiktok.com links are supported." };
}
