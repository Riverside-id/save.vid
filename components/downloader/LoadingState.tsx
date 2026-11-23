import { LoaderCircle } from "lucide-react";
import type { Platform } from "@/lib/types";
import { PLATFORM_LABEL } from "./PlatformGlyph";

export function LoadingState({ platform }: { platform: Platform }) {
  return (
    <div role="status" aria-live="polite" className="mt-2 animate-fade-up rounded-2xl bg-canvas/60 p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-brand" aria-hidden />
        <p className="text-sm font-medium">
          Fetching post details from {PLATFORM_LABEL[platform]}…
          <span className="block text-xs font-normal text-muted">This usually takes a few seconds.</span>
        </p>
      </div>
      <div className="mt-4 flex items-center gap-3" aria-hidden>
        <div className="skeleton size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-1/3 rounded-full" />
          <div className="skeleton h-3 w-2/3 rounded-full" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3" aria-hidden>
        <div className="skeleton aspect-[4/5] rounded-2xl" />
        <div className="skeleton aspect-[4/5] rounded-2xl" />
      </div>
    </div>
  );
}
