import { checkUrl } from "@/lib/url";
import { isAllowedMediaUrl } from "./allowlist";

/**
 * TikTok adapter (server-only).
 *
 * How it works — and what it deliberately does NOT do:
 * - It requests the public post page with an honest User-Agent, exactly once,
 *   and reads the post data TikTok embeds in that page.
 * - TikTok sets anonymous session cookies on that response; its video URLs only
 *   work together with them, so every download re-reads the page in its own
 *   short-lived session. Nothing is stored beyond a 60 s in-memory cache.
 * - It never impersonates a browser, never solves bot challenges, never logs in
 *   and never uses user cookies. If TikTok answers with a bot check instead of
 *   the post, we report that honestly.
 * - Watermarks: only `bitrateInfo`/`playAddr` sources are used. `downloadAddr`
 *   (TikTok adds a moving watermark to it — verified) is never offered.
 */

export const USER_AGENT = "SocialSaver/0.1 (+public post reader)";
const PAGE_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const SESSION_TTL_MS = 60_000;

export class TikTokError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "LOGIN_REQUIRED" | "UPSTREAM_BLOCKED" | "UPSTREAM_ERROR" | "TIMEOUT" | "NO_MEDIA" | "UNSUPPORTED_URL",
    message: string,
  ) {
    super(message);
  }
}

/* ── Minimal shapes of the embedded JSON we rely on ───────────────────── */
interface TtAddr {
  DataSize?: number;
  Width?: number;
  Height?: number;
  UrlList?: string[];
}
interface TtBitrate {
  GearName?: string;
  CodecType?: string;
  PlayAddr?: TtAddr;
}
interface TtImage {
  imageURL?: { urlList?: string[] };
  imageWidth?: number;
  imageHeight?: number;
}
export interface TtItem {
  id?: string;
  desc?: string;
  author?: { uniqueId?: string; nickname?: string };
  video?: {
    width?: number;
    height?: number;
    duration?: number;
    cover?: string;
    originCover?: string;
    playAddr?: string;
    bitrateInfo?: TtBitrate[];
  };
  imagePost?: { images?: TtImage[]; cover?: { imageURL?: { urlList?: string[] } } };
  isContentClassified?: boolean;
  privateItem?: boolean;
}

export interface TtSession {
  pageUrl: string;
  cookie: string;
  item: TtItem;
  fetchedAt: number;
}

export interface TtMedia {
  key: string; // "video" | "image:N"
  kind: "video" | "image";
  url: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  ext: "mp4" | "jpg" | "webp";
  mime: string;
}

const sessions = new Map<string, TtSession>();

function pos(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function isTikTokPage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ["www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "tiktok.com", "m.tiktok.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

async function getWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  if (!isTikTokPage(url)) throw new TikTokError("UNSUPPORTED_URL", "The link redirected somewhere we don't support.");
  try {
    return await fetch(url, { headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") throw new TikTokError("TIMEOUT", "TikTok took too long to respond. Please try again.");
    throw new TikTokError("UPSTREAM_ERROR", "Could not reach TikTok.");
  }
}

/** Expands vm./vt. short links by reading ONE redirect and re-validating it. */
export async function expandShortLink(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const res = await getWithTimeout(current, { "User-Agent": USER_AGENT, Accept: "text/html" });
    await res.body?.cancel().catch(() => {});
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    const next = new URL(location, current).toString();
    const check = checkUrl(next);
    if (check.ok && check.platform === "tiktok" && check.kind === "post") return check.canonical;
    if (!(check.ok && check.platform === "tiktok")) break;
    current = check.canonical;
  }
  throw new TikTokError("UNSUPPORTED_URL", "We couldn't expand this TikTok short link. Please paste the full post link.");
}

function collectCookies(res: Response): string {
  const pairs: string[] = [];
  for (const c of res.headers.getSetCookie()) {
    const kv = c.split(";")[0]?.trim();
    if (kv && /^[A-Za-z0-9_.-]+=[^;\s]*$/.test(kv)) pairs.push(kv);
  }
  return pairs.join("; ");
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      throw new TikTokError("UPSTREAM_ERROR", "TikTok sent an unexpectedly large page.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseItemFromHtml(html: string): TtItem {
  const m = /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m?.[1]) {
    throw new TikTokError(
      "UPSTREAM_BLOCKED",
      "TikTok didn't return this post to our server (it may be showing a bot check). Social Saver doesn't bypass those checks — please try again later.",
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(m[1]);
  } catch {
    throw new TikTokError("UPSTREAM_ERROR", "TikTok returned data we couldn't read.");
  }
  const detail = (data as { __DEFAULT_SCOPE__?: Record<string, unknown> })?.__DEFAULT_SCOPE__?.["webapp.video-detail"] as
    | { statusCode?: number; itemInfo?: { itemStruct?: TtItem } }
    | undefined;
  const status = detail?.statusCode ?? -1;
  const item = detail?.itemInfo?.itemStruct;
  if (status === 10222 || status === 10216 || item?.privateItem) {
    throw new TikTokError("LOGIN_REQUIRED", "This TikTok post is private. Social Saver only works with public posts.");
  }
  if (status !== 0 || !item) {
    throw new TikTokError("NOT_FOUND", "TikTok couldn't find this post. It may have been deleted, made private or be unavailable.");
  }
  if (item.isContentClassified && !item.video?.playAddr && !item.imagePost) {
    throw new TikTokError("LOGIN_REQUIRED", "This TikTok post is age-restricted and requires logging in, so it can't be accessed.");
  }
  return item;
}

/**
 * The page we actually read for a post. TikTok's `/photo/<id>` pages are rendered
 * in the browser and carry no post data, while `/video/<id>` for the same id does
 * (verified with real slideshows) — so photo posts are read via the video path.
 */
export function pageUrlFor(canonicalPostUrl: string): string {
  return canonicalPostUrl.replace(/^(https:\/\/www\.tiktok\.com\/@[^/]+)\/photo\/(\d+)$/, "$1/video/$2");
}

/** Reads the post page in a fresh anonymous session (cached for 60 s per instance). */
export async function loadTikTokSession(canonicalPostUrl: string, opts: { fresh?: boolean } = {}): Promise<TtSession> {
  const cached = sessions.get(canonicalPostUrl);
  if (!opts.fresh && cached && Date.now() - cached.fetchedAt < SESSION_TTL_MS) return cached;

  const pageUrl = pageUrlFor(canonicalPostUrl);
  const res = await getWithTimeout(pageUrl, { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "en-US,en;q=0.8" });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => {});
    const loc = res.headers.get("location") ?? "";
    if (loc.includes("/login")) throw new TikTokError("LOGIN_REQUIRED", "TikTok requires logging in to view this post.");
    throw new TikTokError("NOT_FOUND", "TikTok redirected away from this post. It may be unavailable.");
  }
  if (res.status === 404) throw new TikTokError("NOT_FOUND", "TikTok couldn't find this post.");
  if (res.status === 429) throw new TikTokError("UPSTREAM_BLOCKED", "TikTok is limiting requests right now. Please try again later.");
  if (!res.ok) throw new TikTokError("UPSTREAM_ERROR", `TikTok answered with HTTP ${res.status}.`);

  const item = parseItemFromHtml(await readCapped(res));
  const session: TtSession = { pageUrl, cookie: collectCookies(res), item, fetchedAt: Date.now() };
  if (sessions.size > 200) sessions.clear();
  sessions.set(canonicalPostUrl, session);
  return session;
}

function imageExt(url: string): { ext: "jpg" | "webp"; mime: string } {
  return /\.webp(\?|$)|format=webp|~tplv-[^?]*\.webp/i.test(url) ? { ext: "webp", mime: "image/webp" } : { ext: "jpg", mime: "image/jpeg" };
}

/** The watermark-free media of a post: one best H.264 video, or every slideshow image at full size. */
export function listMedia(item: TtItem): TtMedia[] {
  const images = item.imagePost?.images ?? [];
  if (images.length > 0) {
    return images.flatMap((img, n) => {
      const url = img.imageURL?.urlList?.find((u) => typeof u === "string" && u.startsWith("https://"));
      if (!url) return [];
      const t = imageExt(url);
      return [{ key: `image:${n}`, kind: "image" as const, url, width: pos(img.imageWidth), height: pos(img.imageHeight), bytes: null, ...t }];
    });
  }

  const v = item.video;
  if (!v) return [];
  const h264 = (v.bitrateInfo ?? [])
    .filter((b) => (b.CodecType ?? "").toLowerCase().startsWith("h264") && b.PlayAddr?.UrlList?.length)
    .sort((a, b) => (b.PlayAddr?.DataSize ?? 0) - (a.PlayAddr?.DataSize ?? 0));
  // Candidate URLs in preference order: CDN hosts of the best H.264 rendition first,
  // then TikTok's play endpoint, then other renditions, then playAddr. Never downloadAddr.
  const candidates: Array<{ url: string; b: TtBitrate | undefined }> = [];
  for (const b of h264) for (const u of b.PlayAddr?.UrlList ?? []) candidates.push({ url: u, b });
  if (v.playAddr) candidates.push({ url: v.playAddr, b: undefined });
  const allowed = candidates.filter((c) => typeof c.url === "string" && isAllowedMediaUrl(c.url));
  const pick = allowed.find((c) => !c.url.includes("://www.tiktok.com/")) ?? allowed[0];
  if (!pick) {
    const hosts = [...new Set(candidates.map((c) => safeHost(c.url)))].join(", ");
    console.warn(`[tiktok] no allowlisted video URL; candidate hosts: ${hosts || "none"}`);
    return [];
  }
  const best = pick.b ?? h264[0];
  const url = pick.url;
  return [
    {
      key: "video",
      kind: "video",
      url,
      width: pos(best?.PlayAddr?.Width) ?? pos(v.width),
      height: pos(best?.PlayAddr?.Height) ?? pos(v.height),
      bytes: pos(best?.PlayAddr?.DataSize),
      ext: "mp4",
      mime: "video/mp4",
    },
  ];
}

function safeHost(u: unknown): string {
  try {
    return new URL(String(u)).hostname;
  } catch {
    return "invalid";
  }
}

export function coverUrl(item: TtItem): string | null {
  const c = item.video?.originCover || item.video?.cover || item.imagePost?.cover?.imageURL?.urlList?.[0];
  return typeof c === "string" && c.startsWith("https://") ? c : null;
}

export function clearTikTokSessions(): void {
  sessions.clear();
}
