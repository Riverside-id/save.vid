"use client";

import type { Platform } from "@/lib/types";
import { cn } from "@/components/ui/cn";
import { PlatformGlyph, PLATFORM_LABEL } from "./PlatformGlyph";

const PLATFORMS: { id: Platform; hint: string }[] = [
  { id: "instagram", hint: "Reels · Video · Photo" },
  { id: "tiktok", hint: "Video · Slideshow" },
  { id: "pinterest", hint: "Video · Image pins" },
];

export function PlatformTabs({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  return (
    <div role="tablist" aria-label="Choose a platform" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-canvas/60 p-1.5 ring-1 ring-line">
      {PLATFORMS.map((p) => {
        const active = value === p.id;
        return (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(p.id)}
            className={cn(
              "group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 transition-all duration-200 sm:min-h-12 sm:flex-row sm:justify-start sm:gap-2.5 sm:px-3 sm:text-left",
              active ? "bg-surface-2 ring-1 ring-brand/40 shadow-[0_6px_20px_-12px_rgb(236_72_153/0.7)]" : "hover:bg-white/[0.04]",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg transition-colors sm:size-8",
                active ? "bg-brand text-white" : "bg-white/5 text-muted group-hover:text-fg",
              )}
            >
              <PlatformGlyph platform={p.id} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-bold sm:text-sm", active ? "text-fg" : "text-muted group-hover:text-fg")}>
                {PLATFORM_LABEL[p.id]}
              </span>
              <span className="hidden truncate text-[11px] text-muted lg:block">{p.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
