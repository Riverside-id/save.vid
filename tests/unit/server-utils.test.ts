import { beforeEach, describe, expect, it } from "vitest";
import { isAllowedMediaUrl, mediaClass } from "@/lib/server/allowlist";
import { contentDisposition, sanitizeFilename, uniqueName } from "@/lib/server/filename";
import { clientIp } from "@/lib/server/ip";
import { checkRateLimit, rateKey, resetRateLimiter } from "@/lib/server/ratelimit";
import { sanitizeRange } from "@/lib/server/upstream";
import { toPngName } from "@/lib/image";

describe("media host allowlist", () => {
  it.each([
    "https://scontent-cgk2-1.cdninstagram.com/o1/v/x.mp4?a=1",
    "https://scontent.xx.fbcdn.net/v/x.jpg",
    "https://p16-common-sign.tiktokcdn.com/obj/x.jpg",
    "https://v16-webapp-prime.tiktok.com/video/tos/x/",
  ])("allows %s", (u) => expect(isAllowedMediaUrl(u)).toBe(true));

  it.each([
    "http://scontent.cdninstagram.com/x.mp4",
    "https://cdninstagram.com/x.mp4",
    "https://evilcdninstagram.com/x.mp4",
    "https://scontent.cdninstagram.com.evil.example/x.mp4",
    "https://www.tiktok.com/@a/video/1",
    "https://u:p@scontent.cdninstagram.com/x",
    "https://scontent.cdninstagram.com:8443/x",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "not a url",
  ])("blocks %s", (u) => expect(isAllowedMediaUrl(u)).toBe(false));

  it("classifies MIME types", () => {
    expect(mediaClass("video/mp4")).toBe("video");
    expect(mediaClass("image/jpeg")).toBe("image");
    expect(mediaClass("text/html")).toBeNull();
  });
});

describe("filenames", () => {
  it("sanitizes dangerous names", () => {
    expect(sanitizeFilename('../../etc/passwd"\r\n.mp4')).toBe("etc-passwd-.mp4");
    expect(sanitizeFilename("Ñandú café.jpg")).toBe("Nandu-cafe.jpg");
    expect(sanitizeFilename("....")).toBe("social-saver");
    expect(contentDisposition("attachment", 'a"b.mp4')).toBe(`attachment; filename="a-b.mp4"; filename*=UTF-8''a-b.mp4`);
    expect(toPngName("socialsaver_ig_x.jpg")).toBe("socialsaver_ig_x.png");
  });

  it("makes ZIP entry names unique", () => {
    const used = new Set<string>();
    expect([uniqueName("a.jpg", used), uniqueName("a.jpg", used), uniqueName("A.JPG", used)]).toEqual(["a.jpg", "a-2.jpg", "A-3.JPG"]);
  });
});

describe("ranges and IPs", () => {
  it("only passes single, well-formed byte ranges", () => {
    expect(sanitizeRange("bytes=0-1023")).toBe("bytes=0-1023");
    expect(sanitizeRange("bytes=100-")).toBe("bytes=100-");
    expect(sanitizeRange("bytes=0-1,5-9")).toBeNull();
    expect(sanitizeRange("bytes=-")).toBeNull();
    expect(sanitizeRange("items=0-1")).toBeNull();
  });

  it("reads the client IP from platform headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("rate limiter (in-memory)", () => {
  beforeEach(() => resetRateLimiter());

  it("allows up to the limit per window, then asks to wait", async () => {
    const key = rateKey("1.2.3.4", "secret", "t");
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(key, 3, { now })).toBeNull();
    expect(await checkRateLimit(key, 3, { now })).toBeGreaterThan(0);
    expect(await checkRateLimit(key, 3, { now: now + 61_000 })).toBeNull();
  });

  it("hashes IPs instead of storing them", () => {
    expect(rateKey("1.2.3.4", "secret", "media")).not.toContain("1.2.3.4");
  });
});
