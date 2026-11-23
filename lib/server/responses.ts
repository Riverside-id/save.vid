export function jsonError(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } },
  );
}

/** Rejects hotlinking from other sites (browsers send Sec-Fetch-Site on every request). */
export function isCrossSite(headers: Headers): boolean {
  return headers.get("sec-fetch-site") === "cross-site";
}

/** For state-less POST endpoints: when an Origin is present it must be our own host. */
export function originMatchesHost(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return true;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0]!.trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}
