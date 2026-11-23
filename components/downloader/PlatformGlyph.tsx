import { Camera, Music2 } from "lucide-react";
import type { Platform } from "@/lib/types";

/** Neutral glyphs — we intentionally do not use the platforms' trademarked logos. */
export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  return platform === "instagram" ? <Camera className={className} aria-hidden /> : <Music2 className={className} aria-hidden />;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
};
