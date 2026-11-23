export type AudioFormat = "mp3" | "m4a";

export function audioUrl(token: string, format: AudioFormat): string {
  return `/api/audio?${new URLSearchParams({ t: token, f: format }).toString()}`;
}

/**
 * Converts a video to audio on the server and saves the result.
 * Audio files are small, so we fetch them as a Blob: that lets the button show
 * progress and a real error message (e.g. "This video has no audio track").
 */
export async function downloadAudio(token: string, format: AudioFormat, videoFilename: string): Promise<void> {
  const res = await fetch(audioUrl(token, format), { cache: "no-store" });
  if (!res.ok) {
    let message = `Conversion failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `${videoFilename.replace(/\.[A-Za-z0-9]{2,5}$/, "") || "social-saver"}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
