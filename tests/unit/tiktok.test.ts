import { describe, expect, it } from "vitest";
import { coverUrl, listMedia, pageUrlFor, parseItemFromHtml, TikTokError } from "@/lib/server/tiktok";
import { SLIDESHOW_ITEM, tiktokPage, VIDEO_ITEM } from "../fixtures/tiktok";

describe("TikTok parsing", () => {
  it("picks the largest H.264 watermark-free source and never downloadAddr", () => {
    const media = listMedia(parseItemFromHtml(tiktokPage(VIDEO_ITEM)));
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ key: "video", kind: "video", url: "https://v16-webapp-prime.tiktok.com/video/best/", width: 576, height: 1024 });
    expect(JSON.stringify(media)).not.toContain("WATERMARKED");
    expect(JSON.stringify(media)).not.toContain("hevc");
  });

  it("skips non-allowlisted hosts and prefers CDN hosts over the play endpoint", () => {
    const withHosts = (urls: string[]) => ({
      ...VIDEO_ITEM,
      video: { ...VIDEO_ITEM.video, playAddr: undefined, bitrateInfo: [{ CodecType: "h264", PlayAddr: { DataSize: 10, Width: 576, Height: 1024, UrlList: urls } }] },
    });
    expect(listMedia(withHosts(["https://www.tiktok.com/aweme/v1/play/?video_id=1", "https://v19-webapp-prime.us.tiktok.com/v/"]))[0]?.url).toBe(
      "https://v19-webapp-prime.us.tiktok.com/v/",
    );
    expect(listMedia(withHosts(["https://evil.example/v.mp4", "https://www.tiktok.com/aweme/v1/play/?video_id=1"]))[0]?.url).toBe(
      "https://www.tiktok.com/aweme/v1/play/?video_id=1",
    );
    const none = { ...withHosts(["https://evil.example/v.mp4"]), video: { ...withHosts(["https://evil.example/v.mp4"]).video, playAddr: "https://evil.example/p" } };
    expect(listMedia(none)).toEqual([]);
  });

  it("falls back to playAddr when bitrateInfo is missing", () => {
    const item = { ...VIDEO_ITEM, video: { ...VIDEO_ITEM.video, bitrateInfo: [] } };
    expect(listMedia(item)[0]?.url).toBe("https://v16-webapp-prime.tiktok.com/video/play/");
  });

  it("reads photo posts through the /video/ page (photo pages carry no data)", () => {
    expect(pageUrlFor("https://www.tiktok.com/@a.b/photo/7145516894085451054")).toBe("https://www.tiktok.com/@a.b/video/7145516894085451054");
    expect(pageUrlFor("https://www.tiktok.com/@a/video/7047596209028074758")).toBe("https://www.tiktok.com/@a/video/7047596209028074758");
  });

  it("lists every slideshow image at full size", () => {
    const media = listMedia(parseItemFromHtml(tiktokPage(SLIDESHOW_ITEM)));
    expect(media.map((m) => [m.key, m.ext, m.width, m.height])).toEqual([
      ["image:0", "jpg", 1080, 1440],
      ["image:1", "webp", 1080, 1350],
    ]);
    expect(coverUrl(SLIDESHOW_ITEM)).toBe("https://p16-sign.tiktokcdn.com/cover.jpeg");
  });

  it("reports a bot-check page honestly instead of trying to bypass it", () => {
    expect(() => parseItemFromHtml("<html><body>Please wait...</body></html>")).toThrow(TikTokError);
    try {
      parseItemFromHtml("<html>Please wait...</html>");
    } catch (e) {
      expect((e as TikTokError).code).toBe("UPSTREAM_BLOCKED");
    }
  });

  it("maps private and missing posts", () => {
    expect(() => parseItemFromHtml(tiktokPage({ ...VIDEO_ITEM, privateItem: true }))).toThrow(/private/);
    expect(() => parseItemFromHtml(tiktokPage(null, 10204))).toThrow(/couldn't find/);
  });
});
