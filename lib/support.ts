/**
 * Honest, human-maintained support matrix shown on the home page.
 * Update `status` and `SUPPORT_VERIFIED_ON` only after a real test (see docs/TESTING.md).
 */
export type SupportStatus = "working" | "preview" | "unavailable" | "untested";

export interface SupportRow {
  feature: string;
  platform: "Instagram" | "TikTok" | "Pinterest" | "All";
  status: SupportStatus;
  detail: string;
}

/** Local verification (developer machine). Production on Vercel is verified separately after deployment. */
export const SUPPORT_VERIFIED_ON: string = "23 Nov 2026 (local test)";

export const SUPPORT_MATRIX: SupportRow[] = [
  { platform: "Instagram", feature: "Reels", status: "working", detail: "Original MP4 from Instagram's CDN, byte-identical to the source." },
  { platform: "Instagram", feature: "Videos", status: "working", detail: "Original MP4; extra HD renditions only when they exist." },
  { platform: "Instagram", feature: "Photos (JPG / PNG)", status: "working", detail: "Full-size JPG (e.g. 1080×1350). PNG is converted in your browser." },
  { platform: "Instagram", feature: "Carousels + ZIP", status: "working", detail: "Every photo/video of the post, or all of them in one streamed ZIP." },
  { platform: "TikTok", feature: "Videos", status: "working", detail: "Watermark-free source — no TikTok overlay (checked frame by frame)." },
  { platform: "TikTok", feature: "Photo slideshows", status: "working", detail: "Every photo at original size, no TikTok watermark; all photos as one ZIP." },
  { platform: "Pinterest", feature: "Video pins", status: "working", detail: "MP4 with sound (e.g. 1080×1920), also for stream-only pins; no watermark added." },
  { platform: "Pinterest", feature: "Image pins", status: "working", detail: "The original upload at full size — never a cropped or resized copy." },
  { platform: "All", feature: "Video → audio (MP3 / M4A)", status: "working", detail: "Audio from any supported video; silent videos are reported, not faked." },
  { platform: "Pinterest", feature: "Pins embedding other sites", status: "unavailable", detail: "Pins that only embed a YouTube/Vimeo video aren't supported." },
];
