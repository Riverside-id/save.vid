import type { ErrorCode, Platform, ResolveFailure, ResolveResponse } from "./types";

export type ClientErrorCode = ErrorCode | "NETWORK";

function failure(code: ClientErrorCode, message: string, retryAfterSeconds?: number): ResolveFailure {
  return { ok: false, error: { code: code as ErrorCode, message, ...(retryAfterSeconds ? { retryAfterSeconds } : {}) } };
}

/** Instagram → Python resolver (yt-dlp); TikTok → Node resolver. */
export function resolveEndpoint(platform: Platform): string {
  return platform === "tiktok" ? "/api/tiktok" : "/api/resolve";
}

/** Never throws (except on abort): every outcome is a ResolveResponse. */
export async function resolveUrl(url: string, platform: Platform, signal?: AbortSignal): Promise<ResolveResponse> {
  let res: Response;
  try {
    res = await fetch(resolveEndpoint(platform), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url }),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    return failure("NETWORK", "Couldn't reach Social Saver. Check your connection and try again.");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await res.json()) as ResolveResponse;
      if (body && typeof body === "object" && "ok" in body) return body;
    } catch {
      /* fall through */
    }
  }

  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after")) || undefined;
    return failure("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", retry);
  }
  if (res.status === 504) return failure("TIMEOUT", "The request took too long. Please try again.");
  if (res.status === 404) return failure("MISCONFIGURED", "The resolver service is not available right now.");
  return failure("INTERNAL", "Something went wrong on our side. Please try again.");
}

export function mediaUrl(token: string, opts: { download?: boolean } = {}): string {
  const params = new URLSearchParams({ t: token });
  if (opts.download) params.set("dl", "1");
  return `/api/media?${params.toString()}`;
}

const ZIP_FRAME = "social-saver-zip-frame";

/**
 * Starts a streamed ZIP download. A real form POST (into a hidden iframe) lets
 * the browser handle the attachment natively — works on mobile Safari and never
 * holds the archive in memory. If the server answers with an error page instead
 * of a file, the iframe loads it and `onError` receives the message.
 */
export function submitZipDownload(tokens: string[], name: string, onError?: (message: string) => void): void {
  let frame = document.querySelector<HTMLIFrameElement>(`iframe[name="${ZIP_FRAME}"]`);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = ZIP_FRAME;
    frame.title = "ZIP download";
    frame.hidden = true;
    document.body.appendChild(frame);
  }
  frame.onload = () => {
    try {
      const message = frame?.contentDocument?.body?.dataset.error;
      if (message && onError) onError(message);
    } catch {
      /* cross-origin or empty — nothing to report */
    }
  };

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/zip";
  form.target = ZIP_FRAME;
  form.hidden = true;
  const add = (key: string, value: string) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  };
  add("name", name);
  for (const t of tokens) add("t", t);
  document.body.appendChild(form);
  form.submit();
  form.remove();
}
