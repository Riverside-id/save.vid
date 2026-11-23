import { describe, expect, it } from "vitest";
import { checkUrl, detectPlatform } from "@/lib/url";

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
