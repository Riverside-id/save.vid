import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tiktok/route";
import { resetRateLimiter } from "@/lib/server/ratelimit";
import { clearTikTokSessions } from "@/lib/server/tiktok";
import { verifyToken } from "@/lib/server/token";
import type { ResolveResponse } from "@/lib/types";
import { mockFetch, req, SECRET, setEnv } from "./helpers";
import { SLIDESHOW_ITEM, tiktokPage, VIDEO_ITEM } from "../fixtures/tiktok";

beforeEach(() => {
  setEnv();
  resetRateLimiter();
  clearTikTokSessions();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const post = (url: string) =>
  POST(req("/api/tiktok", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ url }) }));

describe("POST /api/tiktok", () => {
  it("resolves a public video into one watermark-free MP4 variant", async () => {
    const fetchMock = mockFetch([["www.tiktok.com/@creator/video/", () => new Response(tiktokPage(VIDEO_ITEM), { headers: { "content-type": "text/html" } })]]);
    const res = await post("https://www.tiktok.com/@creator/video/7047596209028074758?is_from_webapp=1");
    const body = (await res.json()) as ResolveResponse;
    expect(res.status).toBe(200);
    if (!body.ok) throw new Error("expected success");
    expect(body).toMatchObject({ platform: "tiktok", postType: "video", downloadable: true, author: { username: "creator" } });
    const v = body.items[0]!.variants[0]!;
    expect(v).toMatchObject({ label: "MP4 · 576×1024", filename: "socialsaver_tiktok_creator_7047596209028074758.mp4" });
    const decoded = verifyToken(v.token, SECRET);
    expect(decoded.ok && decoded.payload).toMatchObject({ k: "tt", i: "video", u: "https://www.tiktok.com/@creator/video/7047596209028074758" });
    // honest client: our own UA, no impersonation
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^SocialSaver\//);
  });

  it("resolves a photo slideshow into full-size images", async () => {
    const fetchMock = mockFetch([["www.tiktok.com/@photographer/video/7300000000000000000", () => new Response(tiktokPage(SLIDESHOW_ITEM))]]);
    const body = (await (await post("https://www.tiktok.com/@photographer/photo/7300000000000000000")).json()) as ResolveResponse;
    if (!body.ok) throw new Error("expected success");
    expect(body.postType).toBe("carousel");
    expect(body.items.map((i) => i.variants[0]!.label)).toEqual(["JPG · 1080×1440", "WEBP · 1080×1350"]);
    expect(body.sourceUrl).toBe("https://www.tiktok.com/@photographer/photo/7300000000000000000");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/video/7300000000000000000");
  });

  it("expands short links only to TikTok post URLs", async () => {
    mockFetch([
      ["vm.tiktok.com/ZMabc123", () => new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@creator/video/7047596209028074758?x=1" } })],
      ["www.tiktok.com/@creator/video/", () => new Response(tiktokPage(VIDEO_ITEM))],
    ]);
    expect((await post("https://vm.tiktok.com/ZMabc123/")).status).toBe(200);

    clearTikTokSessions();
    mockFetch([["vm.tiktok.com/ZMevil999", () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } })]]);
    const res = await post("https://vm.tiktok.com/ZMevil999/");
    expect(res.status).toBe(422);
  });

  it("reports TikTok bot checks honestly", async () => {
    mockFetch([["www.tiktok.com", () => new Response("<html>Please wait...</html>")]]);
    const body = (await (await post("https://www.tiktok.com/@creator/video/7047596209028074758")).json()) as ResolveResponse;
    expect(!body.ok && body.error.code).toBe("UPSTREAM_BLOCKED");
  });

  it("validates input before any network call", async () => {
    const fetchMock = mockFetch([]);
    expect((await post("https://www.instagram.com/p/abcdef/")).status).toBe(422);
    expect((await post("https://evil.example/x")).status).toBe(422);
    expect((await post("")).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
