import type { NextConfig } from "next";

/**
 * The Python extraction function lives in `api/resolve.py` and is served by
 * Vercel's Python runtime at `/api/resolve`. Locally there is no Vercel router,
 * so we proxy `/api/resolve` to the local Python dev server instead.
 *
 * `PYTHON_API_URL` is only meant for local development / local production
 * testing. Never set it on Vercel.
 */
const pythonApiUrl =
  process.env.PYTHON_API_URL ||
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : undefined);

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    if (!pythonApiUrl) return [];
    return [{ source: "/api/resolve", destination: `${pythonApiUrl}/api/resolve` }];
  },
};

export default nextConfig;
