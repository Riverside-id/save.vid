import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { POST } from "@/app/api/zip/route";
import { resetRateLimiter } from "@/lib/server/ratelimit";
import { mockFetch, req, setEnv, token } from "./helpers";

beforeEach(() => {
  setEnv();
  resetRateLimiter();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(tokens: string[], name = "instagram_creator_post") {
  const body = new URLSearchParams({ name });
  for (const t of tokens) body.append("t", t);
  return { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: "http://localhost:3000" }, body: body.toString() };
}

describe("POST /api/zip", () => {
  it("streams every file into one ZIP with unique, sanitized names", async () => {
    mockFetch([
      ["a.jpg", () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })],
      ["b.jpg", () => new Response(new Uint8Array([4, 5]), { headers: { "content-type": "image/jpeg" } })],
    ]);
    const tokens = [
      token({ u: "https://s.cdninstagram.com/a.jpg", m: "image/jpeg", f: "photo.jpg" }),
      token({ u: "https://s.cdninstagram.com/b.jpg", m: "image/jpeg", f: "photo.jpg" }),
    ];
    const res = await POST(req("/api/zip", form(tokens)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toContain('filename="instagram_creator_post.zip"');
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(["photo-2.jpg", "photo.jpg"]);
    expect(Array.from(files["photo.jpg"]!)).toEqual([1, 2, 3]);
  });

  it("rejects bad tokens, too many items and foreign origins", async () => {
    mockFetch([]);
    expect((await POST(req("/api/zip", form([`${token()}x`])))).status).toBe(400);
    expect((await POST(req("/api/zip", form([])))).status).toBe(400);
    setEnv({ MAX_ZIP_ITEMS: "1" });
    expect((await POST(req("/api/zip", form([token(), token()])))).status).toBe(400);
    const foreign = form([token()]);
    foreign.headers.origin = "https://evil.example";
    const res = await POST(req("/api/zip", foreign));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("data-error");
  });
});
