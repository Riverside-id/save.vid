import { isAllowedMediaUrl } from "./allowlist";

/**
 * Fetches a media file from an allowlisted CDN.
 * - every redirect hop is re-validated against the allowlist (no blind follow)
 * - a timeout applies until response headers arrive; the body then streams
 * - the content type must match what the token promised (video vs image)
 */

export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const USER_AGENT = "SocialSaver/0.1 (+media proxy)";
const OCTET = new Set(["application/octet-stream", "binary/octet-stream"]);

export interface UpstreamResult {
  response: Response;
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number | null;
}

export function sanitizeRange(range: string | null): string | null {
  if (!range) return null;
  const v = range.trim();
  return /^bytes=\d{0,15}-\d{0,15}$/.test(v) && v !== "bytes=-" ? v : null;
}

export async function fetchUpstream(
  url: string,
  opts: {
    expected: "video" | "image";
    referer: string | null;
    /** Session cookie header (TikTok only); sent only to *.tiktok.com hosts. */
    cookie?: string | null;
    maxBytes: number;
    range?: string | null;
    timeoutMs?: number;
    maxRedirects?: number;
    signal?: AbortSignal;
  },
): Promise<UpstreamResult> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isAllowedMediaUrl(current)) {
      let host = "invalid";
      try {
        host = new URL(current).hostname;
      } catch {
        /* keep "invalid" */
      }
      console.warn(`[upstream] blocked media host: ${host}`);
      throw new UpstreamError(502, "DISALLOWED_HOST", "Media host is not allowed.");
    }

    const headerTimeout = new AbortController();
    const timer = setTimeout(() => headerTimeout.abort(new Error("upstream timeout")), timeoutMs);
    const signal = opts.signal ? AbortSignal.any([headerTimeout.signal, opts.signal]) : headerTimeout.signal;
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: opts.expected === "image" ? "image/avif,image/webp,image/jpeg,image/*;q=0.8" : "video/mp4,video/*;q=0.9,*/*;q=0.5",
          ...(opts.referer ? { Referer: opts.referer } : {}),
          ...(opts.range ? { Range: opts.range } : {}),
          ...(opts.cookie && new URL(current).hostname.endsWith(".tiktok.com") ? { Cookie: opts.cookie } : {}),
        },
      });
    } catch (err) {
      clearTimeout(timer);
      if (headerTimeout.signal.aborted) throw new UpstreamError(504, "TIMEOUT", "The media server took too long to respond.");
      throw new UpstreamError(502, "UPSTREAM_ERROR", `Could not reach the media server (${(err as Error).name}).`);
    }
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new UpstreamError(502, "UPSTREAM_ERROR", "Broken redirect from the media server.");
      current = new URL(location, current).toString();
      continue;
    }

    if (res.status === 403 || res.status === 404 || res.status === 410) {
      await res.body?.cancel().catch(() => {});
      throw new UpstreamError(410, "EXPIRED", "This file link has expired or was removed. Process the post link again.");
    }
    if (res.status === 416) {
      await res.body?.cancel().catch(() => {});
      throw new UpstreamError(416, "RANGE", "Requested range not satisfiable.");
    }
    if (!(res.status === 200 || res.status === 206) || !res.body) {
      await res.body?.cancel().catch(() => {});
      throw new UpstreamError(502, "UPSTREAM_ERROR", `The media server answered with HTTP ${res.status}.`);
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!(contentType.startsWith(`${opts.expected}/`) || OCTET.has(contentType))) {
      await res.body.cancel().catch(() => {});
      throw new UpstreamError(502, "BAD_CONTENT_TYPE", "The media server returned an unexpected file type.");
    }

    const lengthHeader = res.headers.get("content-length");
    const contentLength = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;
    if (contentLength !== null && contentLength > opts.maxBytes) {
      await res.body.cancel().catch(() => {});
      throw new UpstreamError(413, "TOO_LARGE", "This file is larger than Social Saver allows.");
    }

    return { response: res, body: res.body, contentType, contentLength };
  }
  throw new UpstreamError(502, "UPSTREAM_ERROR", "Too many redirects from the media server.");
}

/** Passes bytes through, erroring the stream once `budget.remaining` would go negative. */
export function limitStream(body: ReadableStream<Uint8Array>, budget: { remaining: number }): ReadableStream<Uint8Array> {
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        budget.remaining -= chunk.byteLength;
        if (budget.remaining < 0) {
          controller.error(new UpstreamError(413, "TOO_LARGE", "Size limit exceeded."));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}
