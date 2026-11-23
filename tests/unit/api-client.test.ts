import { afterEach, describe, expect, it, vi } from "vitest";
import { mediaUrl, resolveEndpoint, resolveUrl } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("routes platforms to their resolver", () => {
    expect(resolveEndpoint("instagram")).toBe("/api/resolve");
    expect(resolveEndpoint("tiktok")).toBe("/api/tiktok");
    expect(resolveEndpoint("pinterest")).toBe("/api/resolve");
    expect(mediaUrl("a.b", { download: true })).toBe("/api/media?t=a.b&dl=1");
  });

  it("maps non-JSON gateway errors to friendly codes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Gateway Timeout", { status: 504 })));
    const r = await resolveUrl("https://www.instagram.com/p/abcdef/", "instagram");
    expect(!r.ok && r.error.code).toBe("TIMEOUT");
  });

  it("maps network failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("failed"))));
    const r = await resolveUrl("https://www.instagram.com/p/abcdef/", "instagram");
    expect(!r.ok && r.error.code).toBe("NETWORK");
  });
});
