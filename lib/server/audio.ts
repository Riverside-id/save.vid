import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import ffmpegStatic from "ffmpeg-static";

/**
 * Video → audio with ffmpeg (bundled via ffmpeg-static).
 *
 * The video is streamed into a private temp directory (so MP4 files whose index
 * sits at the end still work), converted, read back, and the directory is
 * deleted immediately — nothing is kept.
 *
 * - mp3: re-encoded with LAME VBR ~190 kbps (plays everywhere)
 * - m4a: the original AAC track copied without re-encoding (identical quality);
 *        falls back to an AAC encode if the source codec can't be copied
 */

export type AudioFormat = "mp3" | "m4a";

export const AUDIO_MIME: Record<AudioFormat, string> = { mp3: "audio/mpeg", m4a: "audio/mp4" };

export class AudioError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: "NO_AUDIO" | "CONVERSION_FAILED" | "TOO_LARGE" | "TIMEOUT",
    message: string,
  ) {
    super(message);
  }
}

export function ffmpegPath(): string {
  const p = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string | null);
  if (!p) throw new AudioError(500, "CONVERSION_FAILED", "Audio conversion is not available on this server.");
  return p;
}

function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stderr: string; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 8000) stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, timedOut });
    });
  });
}

const BASE = ["-hide_banner", "-nostdin", "-loglevel", "error", "-y"];

function outputArgs(format: AudioFormat, reencodeAac: boolean): string[] {
  const common = ["-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1"];
  if (format === "mp3") return [...common, "-c:a", "libmp3lame", "-q:a", "2", "-f", "mp3"];
  return [...common, ...(reencodeAac ? ["-c:a", "aac", "-b:a", "192k"] : ["-c:a", "copy"]), "-movflags", "+faststart", "-f", "ipod"];
}

function isNoAudio(stderr: string): boolean {
  return /matches no streams|does not contain any stream|Output file .* does not contain any stream/i.test(stderr);
}

export async function extractAudio(
  input: ReadableStream<Uint8Array>,
  format: AudioFormat,
  opts: { maxOutputBytes: number; timeoutMs?: number },
): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const dir = await mkdtemp(path.join(tmpdir(), "socialsaver-audio-"));
  try {
    const inFile = path.join(dir, "input");
    await pipeline(Readable.fromWeb(input as unknown as NodeWebReadableStream<Uint8Array>), createWriteStream(inFile));
    const outFile = path.join(dir, `output.${format}`);

    let result = await run(ffmpegPath(), [...BASE, "-i", inFile, ...outputArgs(format, false), outFile], timeoutMs);
    if (result.code !== 0 && !result.timedOut && format === "m4a" && !isNoAudio(result.stderr)) {
      // e.g. a non-AAC source that can't be copied into M4A → encode to AAC instead
      result = await run(ffmpegPath(), [...BASE, "-i", inFile, ...outputArgs(format, true), outFile], timeoutMs);
    }
    if (result.timedOut) throw new AudioError(504, "TIMEOUT", "Converting this video took too long.");
    if (result.code !== 0) {
      if (isNoAudio(result.stderr)) throw new AudioError(422, "NO_AUDIO", "This video has no audio track.");
      throw new AudioError(502, "CONVERSION_FAILED", "We couldn't convert this video to audio.");
    }

    const size = (await stat(outFile)).size;
    if (size === 0) throw new AudioError(422, "NO_AUDIO", "This video has no audio track.");
    if (size > opts.maxOutputBytes) throw new AudioError(413, "TOO_LARGE", "The audio file is larger than Social Saver allows.");
    return await readFile(outFile);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function audioFilename(videoFilename: string, format: AudioFormat): string {
  const stem = videoFilename.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  return `${stem || "social-saver"}.${format}`;
}
