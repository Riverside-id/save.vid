import { downloadZip } from "client-zip";
import type { NextRequest } from "next/server";
import { mediaClass } from "@/lib/server/allowlist";
import { getTokenSecret, MisconfiguredError, serverLimits } from "@/lib/server/env";
import { contentDisposition, sanitizeFilename, uniqueName } from "@/lib/server/filename";
import { clientIp } from "@/lib/server/ip";
import { checkRateLimit, rateKey } from "@/lib/server/ratelimit";
import { originMatchesHost } from "@/lib/server/responses";
import { verifyToken } from "@/lib/server/token";
import { openMedia } from "@/lib/server/media-target";
import { limitStream } from "@/lib/server/upstream";
import type { MediaTokenPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Errors are rendered as a tiny HTML page: the form is posted into a hidden
 * iframe, and the client reads `data-error` from it to show a friendly message.
 */
function htmlError(status: number, message: string): Response {
  const safe = message.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html><meta charset="utf-8"><body data-error="${safe}">${safe}</body>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

/** POST /api/zip (form fields: t=<token> repeated, name=<archive name>) → streamed ZIP. */
export async function POST(req: NextRequest): Promise<Response> {
  if (!originMatchesHost(req.headers)) return htmlError(403, "Cross-origin requests are not allowed.");

  let secret: string;
  try {
    secret = getTokenSecret();
  } catch (err) {
    if (err instanceof MisconfiguredError) return htmlError(500, "Server is not configured.");
    throw err;
  }
  const limits = serverLimits();

  const wait = await checkRateLimit(rateKey(clientIp(req.headers), secret, "zip"), limits.zipPerMinute, {
    upstashUrl: limits.upstashUrl,
    upstashToken: limits.upstashToken,
  });
  if (wait) return htmlError(429, `Too many ZIP downloads. Try again in ${wait}s.`);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return htmlError(400, "Invalid request.");
  }
  const tokens = form.getAll("t").filter((t): t is string => typeof t === "string");
  if (tokens.length === 0) return htmlError(400, "Nothing to download.");
  if (tokens.length > limits.maxZipItems) return htmlError(400, `A ZIP can contain at most ${limits.maxZipItems} files.`);

  const payloads: MediaTokenPayload[] = [];
  for (const t of tokens) {
    const v = verifyToken(t, secret);
    if (!v.ok) {
      return htmlError(v.reason === "expired" ? 410 : 400, v.reason === "expired" ? "These links expired. Process the post again." : "Invalid download link.");
    }
    if (!mediaClass(v.payload.m)) return htmlError(400, "Invalid download link.");
    payloads.push(v.payload);
  }

  const rawName = form.get("name");
  const archiveName = `${sanitizeFilename(typeof rawName === "string" ? rawName : "", "social-saver")}.zip`;
  const budget = { remaining: limits.maxZipBytes };
  const used = new Set<string>();
  const signal = req.signal;

  // Files are fetched lazily, one after another, while the ZIP is being streamed.
  async function* entries() {
    for (const p of payloads) {
      const upstream = await openMedia(p, {
        maxBytes: Math.min(limits.maxMediaBytes, Math.max(0, budget.remaining)),
        signal,
      });
      yield {
        name: uniqueName(sanitizeFilename(p.f), used),
        input: limitStream(upstream.body, budget),
        lastModified: new Date(),
      };
    }
  }

  const zip = downloadZip(entries());
  return new Response(zip.body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("attachment", archiveName),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
