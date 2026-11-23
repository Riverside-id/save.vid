import { describe, expect, it } from "vitest";
import { coverUrl, listMedia, parseItemFromHtml, TikTokError } from "@/lib/server/tiktok";
import { SLIDESHOW_ITEM, tiktokPage, VIDEO_ITEM } from "../fixtures/tiktok";

describe("TikTok parsing", () => {
  it("picks the largest H.264 watermark-free source and never downloadAddr", () => {
    const media = listMedia(parseItemFromHtml(tiktokPage(VIDEO_ITEM)));
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ key: "video", kind: "video", url: "https://v16-webapp-prime.tiktok.com/video/best/", width: 576, height: 1024 });
    expect(JSON.stringify(media)).not.toContain("WATERMARKED");
    expect(JSON.stringify(media)).not.toContain("hevc");
  });

  it("falls back to playAddr when bitrateInfo is missing", () => {
    const item = { ...VIDEO_ITEM, video: { ...VIDEO_ITEM.video, bitrateInfo: [] } };
    expect(listMedia(item)[0]?.url).toBe("https://v16-webapp-prime.tiktok.com/video/play/");
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
