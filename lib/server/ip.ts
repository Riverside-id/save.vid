/** Best-effort client IP. On Vercel these headers are set by the platform (client values are overwritten). */
export function clientIp(headers: Headers): string {
  for (const name of ["x-real-ip", "x-forwarded-for", "x-vercel-forwarded-for"]) {
    const value = headers.get(name);
    if (value) return value.split(",")[0]!.trim().slice(0, 64);
  }
  return "unknown";
}
