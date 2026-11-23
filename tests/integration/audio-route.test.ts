import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ffmpeg from "ffmpeg-static";
import { GET } from "@/app/api/audio/route";
import { resetRateLimiter } from "@/lib/server/ratelimit";
import { mockFetch, req, setEnv, token } from "./helpers";

// Real ffmpeg, real (tiny, generated) videos — nothing about the conversion is mocked.
let dir = "";
let withAudio: Uint8Array<ArrayBuffer>;
let silent: Uint8Array<ArrayBuffer>;

function make(file: string, audio: boolean) {
  const out = path.join(dir, file);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=pink:s=64x64:d=1"];
  if (audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac", "-shortest");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", out);
  const r = spawnSync(ffmpeg as unknown as string, args);
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return new Uint8Array(readFileSync(out));
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ss-audio-test-"));
  withAudio = make("a.mp4", true);
  silent = make("s.mp4", false);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  setEnv();
  resetRateLimiter();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const video = (bytes: Uint8Array<ArrayBuffer>) =>
  mockFetch([["cdninstagram.com", () => new Response(bytes, { headers: { "content-type": "video/mp4" } })]]);

describe("GET /api/audio", () => {
  it("converts a video to MP3", async () => {
    video(withAudio);
    const res = await GET(req(`/api/audio?t=${token({ f: "socialsaver_ig_x.mp4" })}&f=mp3`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("content-disposition")).toContain('filename="socialsaver_ig_x.mp3"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Number(res.headers.get("content-length"))).toBe(bytes.byteLength);
    const id3 = String.fromCharCode(...bytes.slice(0, 3)) === "ID3";
    const frameSync = bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0;
    expect(id3 || frameSync).toBe(true);
  }, 30_000);

  it("copies the original AAC track into M4A", async () => {
    video(withAudio);
    const res = await GET(req(`/api/audio?t=${token()}&f=m4a`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mp4");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(4, 8))).toBe("ftyp");
  }, 30_000);

  it("says so honestly when the video has no audio track", async () => {
    video(silent);
    const res = await GET(req(`/api/audio?t=${token()}&f=mp3`));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("NO_AUDIO");
  }, 30_000);

  it("validates format, token and media type before doing any work", async () => {
    const fetchMock = mockFetch([]);
    expect((await GET(req(`/api/audio?t=${token()}&f=wav`))).status).toBe(400);
    expect((await GET(req(`/api/audio?t=${token()}x&f=mp3`))).status).toBe(400);
    expect((await GET(req(`/api/audio?t=${token({ m: "image/jpeg" })}&f=mp3`))).status).toBe(400);
    expect((await GET(req(`/api/audio?t=${token()}&f=mp3`, { headers: { "sec-fetch-site": "cross-site" } }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
