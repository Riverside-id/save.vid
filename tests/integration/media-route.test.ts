import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/media/route";
import { clearTikTokSessions } from "@/lib/server/tiktok";
import { resetRateLimiter } from "@/lib/server/ratelimit";
import { bytes, mockFetch, req, setEnv, token } from "./helpers";
import { tiktokPage, VIDEO_ITEM } from "../fixtures/tiktok";

beforeEach(() => {
  setEnv();
  resetRateLimiter();
  clearTikTokSessions();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/media", () => {
  it("streams an allowlisted CDN file as an attachment with a safe filename", async () => {
    const fetchMock = mockFetch([["cdninstagram.com", () => new Response(bytes(1000), { headers: { "content-type": "video/mp4", "content-length": "1000" } })]]);
    const res = await GET(req(`/api/media?t=${token()}&dl=1`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-disposition")).toContain('attachment; filename="socialsaver_ig_test.mp4"');
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Referer).toBe("https://www.instagram.com/");
    expect(init.redirect).toBe("manual");
  });

  it("passes byte ranges through for video seeking", async () => {
    mockFetch([
      [
        "cdninstagram.com",
        (_u, init) => {
          expect((init?.headers as Record<string, string>).Range).toBe("bytes=0-99");
          return new Response(bytes(100), { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-99/1000" } });
        },
      ],
    ]);
    const res = await GET(req(`/api/media?t=${token()}`, { headers: { range: "bytes=0-99" } }));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-99/1000");
    expect(res.headers.get("content-disposition")).toMatch(/^inline/);
  });

  it("rejects tampered, expired and off-allowlist tokens without fetching", async () => {
    const fetchMock = mockFetch([]);
    expect((await GET(req(`/api/media?t=${token()}x`))).status).toBe(400);
    expect((await GET(req(`/api/media?t=${token({ x: 1 })}`))).status).toBe(410);
    expect((await GET(req(`/api/media?t=${token({ u: "https://169.254.169.254/latest" })}`))).status).toBe(400);
    expect((await GET(req(`/api/media?t=${token({ m: "text/html" })}`))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-validates redirects and refuses to follow them off the allowlist", async () => {
    mockFetch([["cdninstagram.com", () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:8080/admin" } })]]);
    const res = await GET(req(`/api/media?t=${token()}`));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("DISALLOWED_HOST");
  });

  it("refuses unexpected content types and oversized files", async () => {
    mockFetch([["cdninstagram.com", () => new Response("<html>", { headers: { "content-type": "text/html" } })]]);
    expect((await GET(req(`/api/media?t=${token()}`))).status).toBe(502);

    setEnv({ MAX_MEDIA_MB: "1" });
    mockFetch([["cdninstagram.com", () => new Response(bytes(10), { headers: { "content-type": "video/mp4", "content-length": String(5 * 1024 * 1024) } })]]);
    expect((await GET(req(`/api/media?t=${token()}`))).status).toBe(413);
  });

  it("blocks cross-site hotlinking and enforces the rate limit", async () => {
    mockFetch([["cdninstagram.com", () => new Response(bytes(1), { headers: { "content-type": "video/mp4" } })]]);
    expect((await GET(req(`/api/media?t=${token()}`, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);

    setEnv({ RATE_LIMIT_MEDIA_PER_MIN: "2" });
    const h = { "x-forwarded-for": "9.9.9.9" };
    expect((await GET(req(`/api/media?t=${token()}`, { headers: h }))).status).toBe(200);
    expect((await GET(req(`/api/media?t=${token()}`, { headers: h }))).status).toBe(200);
    const limited = await GET(req(`/api/media?t=${token()}`, { headers: h }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("maps expired CDN links to 410", async () => {
    mockFetch([["cdninstagram.com", () => new Response("URL signature expired", { status: 403 })]]);
    expect((await GET(req(`/api/media?t=${token()}`))).status).toBe(410);
  });

  it("streams TikTok media in a fresh session with TikTok's own cookies", async () => {
    const fetchMock = mockFetch([
      [
        "www.tiktok.com/@creator",
        () => new Response(tiktokPage(VIDEO_ITEM), { headers: { "content-type": "text/html", "set-cookie": "tt_chain_token=abc; Domain=.tiktok.com; Path=/" } }),
      ],
      [
        "v16-webapp-prime.tiktok.com/video/best/",
        (_u, init) => {
          expect((init?.headers as Record<string, string>).Cookie).toBe("tt_chain_token=abc");
          return new Response(bytes(500), { headers: { "content-type": "video/mp4" } });
        },
      ],
    ]);
    const t = token({ k: "tt", i: "video", u: "https://www.tiktok.com/@creator/video/7047596209028074758", r: null, f: "tt.mp4" });
    const res = await GET(req(`/api/media?t=${t}&dl=1`));
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(500);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain(VIDEO_ITEM.video.downloadAddr);
  });
});
