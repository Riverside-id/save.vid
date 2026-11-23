import { Camera, Music2, Pin } from "lucide-react";
import type { Platform } from "@/lib/types";

/** Neutral glyphs — we intentionally do not use the platforms' trademarked logos. */
export function PlatformGlyph({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === "instagram") return <Camera className={className} aria-hidden />;
  if (platform === "pinterest") return <Pin className={className} aria-hidden />;
  return <Music2 className={className} aria-hidden />;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};
