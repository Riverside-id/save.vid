import { describe, expect, it } from "vitest";
import { checkUrl, detectLink, detectPlatform } from "@/lib/url";

describe("checkUrl", () => {
  it.each([
    ["https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc", "https://www.instagram.com/reel/Chunk8-jurw/"],
    ["instagram.com/p/BQ0eAlwhDrw", "https://www.instagram.com/p/BQ0eAlwhDrw/"],
    ["https://www.instagram.com/reels/Chunk8-jurw/", "https://www.instagram.com/reel/Chunk8-jurw/"],
    ["https://www.instagram.com/someuser/p/BQ0eAlwhDrw/", "https://www.instagram.com/p/BQ0eAlwhDrw/"],
    ["https://www.tiktok.com/@hankgreen1/video/7047596209028074758?is_from_webapp=1", "https://www.tiktok.com/@hankgreen1/video/7047596209028074758"],
    ["https://www.tiktok.com/@user.name/photo/7300000000000000000", "https://www.tiktok.com/@user.name/photo/7300000000000000000"],
    ["https://vm.tiktok.com/ZMabc123/", "https://vm.tiktok.com/ZMabc123/"],
  ])("accepts %s", (input, canonical) => {
    const r = checkUrl(input);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.canonical).toBe(canonical);
  });

  it.each([
    ["", "empty"],
    ["not a url", "invalid"],
    ["javascript:alert(1)", "invalid"],
    ["ftp://instagram.com/p/abcdef", "invalid"],
    ["https://user:pass@www.instagram.com/p/abcdef/", "invalid"],
    ["https://www.instagram.com:8443/p/abcdef/", "invalid"],
    ["https://instagram.com.evil.example/p/abcdef/", "unsupported-host"],
    ["https://evil.example/?u=https://www.instagram.com/p/abcdef/", "unsupported-host"],
    ["https://www.instagram.com/stories/someone/123/", "unsupported-path"],
    ["https://www.instagram.com/someone/", "unsupported-path"],
    ["https://www.tiktok.com/@someone", "unsupported-path"],
    ["http://127.0.0.1/p/abcdef", "unsupported-host"],
  ])("rejects %s", (input, reason) => {
    const r = checkUrl(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("rejects overly long input", () => {
    expect(checkUrl(`https://www.instagram.com/p/${"a".repeat(3000)}`).ok).toBe(false);
  });

  it("detects platforms", () => {
    expect(detectPlatform("https://www.tiktok.com/@a/video/1234567")).toBe("tiktok");
    expect(detectPlatform("instagram.com/p/x")).toBe("instagram");
    expect(detectPlatform("https://example.com")).toBeNull();
  });
});

describe("detectLink (live input detection)", () => {
  it.each([
    ["https://www.instagram.com/reel/Chunk8-jurw/?igsh=1", "instagram", "reel", "Instagram Reel"],
    ["instagram.com/p/BQ0eAlwhDrw", "instagram", "post", "Instagram post"],
    ["https://www.instagram.com/tv/BkfuX9UB-eK/", "instagram", "video", "Instagram video"],
    ["https://www.tiktok.com/@a/video/7047596209028074758", "tiktok", "video", "TikTok video"],
    ["https://www.tiktok.com/@a/photo/7300000000000000000", "tiktok", "photo", "TikTok photo post"],
    ["https://vt.tiktok.com/ZSabc123/", "tiktok", "short-link", "TikTok short link"],
  ])("recognises %s", (input, platform, type, label) => {
    expect(detectLink(input)).toMatchObject({ state: "ready", platform, type, label });
  });

  it("flags the platform while the link is still incomplete", () => {
    expect(detectLink("https://www.instagram.com/someone/")).toMatchObject({ state: "partial", platform: "instagram" });
    expect(detectLink("tiktok.com/@creator")).toMatchObject({ state: "partial", platform: "tiktok" });
  });

  it("handles empty and foreign input", () => {
    expect(detectLink("  ")).toEqual({ state: "empty" });
    expect(detectLink("https://youtube.com/watch?v=x").state).toBe("unknown");
  });
});
