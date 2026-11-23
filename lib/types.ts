/**
 * API contract shared by the UI, the Next.js media proxy and the Python
 * resolver (`api/resolve.py`). Keep in sync with `api/_lib/models.py`.
 */

export type Platform = "instagram" | "tiktok";

export type MediaKind = "video" | "image";

export type PostType = "video" | "image" | "carousel" | "unknown";

export interface MediaVariant {
  /** Stable id within the item, e.g. "mp4-720x1280". */
  id: string;
  /** Human label, e.g. "MP4 · 720×1280". */
  label: string;
  ext: "mp4" | "jpg" | "webp" | "png";
  mime: string;
  width: number | null;
  height: number | null;
  /** `false` when the source is known to have no audio track, `null` when unknown. */
  hasAudio: boolean | null;
  /** Honest extra information shown under the variant. */
  note: string | null;
  /** Suggested download filename (sanitized). */
  filename: string;
  /** Opaque, signed, short-lived token understood by `/api/media`. */
  token: string;
}

export interface MediaItem {
  index: number;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  /** Token for a still preview image (poster for videos). */
  previewToken: string | null;
  /** Best variant first. Empty when the item can only be previewed. */
  variants: MediaVariant[];
}

export interface ResolveSuccess {
  ok: true;
  platform: Platform;
  /** Canonical post URL that was actually processed. */
  sourceUrl: string;
  postType: PostType;
  author: { username: string | null; displayName: string | null };
  caption: string | null;
  /** `false` when we can show a preview but cannot offer the file. */
  downloadable: boolean;
  /** Honest status shown above the result (limitations, partial support...). */
  notice: string | null;
  items: MediaItem[];
  extractor: { name: string; version: string | null };
}

export type ErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "LOGIN_REQUIRED"
  | "UPSTREAM_BLOCKED"
  | "UPSTREAM_ERROR"
  | "TIMEOUT"
  | "NO_MEDIA"
  | "MISCONFIGURED"
  | "INTERNAL";

export interface ResolveFailure {
  ok: false;
  error: { code: ErrorCode; message: string; retryAfterSeconds?: number };
}

export type ResolveResponse = ResolveSuccess | ResolveFailure;

/** Payload carried inside a media token (see `api/_lib/tokens.py`). */
export interface MediaTokenPayload {
  v: 1;
  /** Upstream media URL (must be on the CDN allowlist). */
  u: string;
  /** Referer header to send upstream, if any. */
  r: string | null;
  /** Download filename (already sanitized by the resolver, re-sanitized by the proxy). */
  f: string;
  /** Expected MIME type. */
  m: string;
  /** Expiry, unix seconds. */
  x: number;
  /**
   * Source kind. Absent → `u` is a direct CDN URL.
   * "tt" → `u` is a TikTok post URL; the proxy re-reads the post in its own
   * session (TikTok media URLs only work with the session that produced them).
   */
  k?: "tt";
  /** For "tt": which media to stream, e.g. "video" or "image:0". */
  i?: string;
}
