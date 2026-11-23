"use client";

import { useState } from "react";
import { AudioLines, Download, FileImage, Film, Image as ImageIcon, LoaderCircle, Play, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { mediaUrl } from "@/lib/api-client";
import { downloadAudio, type AudioFormat } from "@/lib/audio";
import { downloadAsPng } from "@/lib/image";
import type { MediaItem } from "@/lib/types";

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MediaItemCard({ item, total }: { item: MediaItem; total: number }) {
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? null);
  const [playing, setPlaying] = useState(false);
  const [pngState, setPngState] = useState<"idle" | "working" | "error">("idle");
  const [audioState, setAudioState] = useState<{ busy: AudioFormat | null; error: string | null }>({ busy: null, error: null });
  const variant = item.variants.find((v) => v.id === variantId) ?? item.variants[0] ?? null;
  const duration = formatDuration(item.durationSeconds);
  const isVideo = item.kind === "video";
  const aspect = item.width && item.height ? `${item.width} / ${item.height}` : isVideo ? "9 / 16" : "4 / 5";

  // Audio is taken from a variant that can carry sound (video-only renditions can't).
  const audioSource = isVideo ? (item.variants.find((v) => v.hasAudio !== false) ?? null) : null;
  const silent = isVideo && item.variants.length > 0 && item.variants.every((v) => v.hasAudio === false);

  async function convertAudio(format: AudioFormat) {
    if (!audioSource) return;
    setAudioState({ busy: format, error: null });
    try {
      await downloadAudio(audioSource.token, format, audioSource.filename);
      setAudioState({ busy: null, error: null });
    } catch (err) {
      setAudioState({ busy: null, error: (err as Error).message });
    }
  }

  async function convertPng() {
    if (!variant) return;
    setPngState("working");
    try {
      await downloadAsPng(variant.token, variant.filename);
      setPngState("idle");
    } catch {
      setPngState("error");
    }
  }

  return (
    <article className="flex animate-fade-up flex-col overflow-hidden rounded-2xl bg-canvas/60 ring-1 ring-line transition-shadow hover:ring-line-strong">
      <div className="relative max-h-[28rem] w-full overflow-hidden bg-black" style={{ aspectRatio: aspect }}>
        {isVideo && playing && variant ? (
          <video
            className="size-full object-contain"
            src={mediaUrl(variant.token)}
            poster={item.previewToken ? mediaUrl(item.previewToken) : undefined}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        ) : item.previewToken ? (
          // Plain <img>: the source is our same-origin streaming proxy, not a static asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(item.previewToken)}
            alt={`${isVideo ? "Video" : "Photo"} preview ${total > 1 ? `${item.index + 1} of ${total}` : ""}`.trim()}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            {isVideo ? <Film className="size-8" aria-hidden /> : <ImageIcon className="size-8" aria-hidden />}
          </div>
        )}

        {isVideo && !playing && variant ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Play preview"
            className="group absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-transparent to-transparent"
          >
            <span className="grid size-14 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur-md transition-all duration-200 group-hover:scale-105 group-hover:bg-brand group-hover:ring-brand">
              <Play className="ml-0.5 size-6 fill-white text-white" aria-hidden />
            </span>
          </button>
        ) : null}

        <div className="pointer-events-none absolute left-2.5 top-2.5 flex gap-1.5">
          <Badge tone="neutral" className="bg-black/60 backdrop-blur-md">
            {isVideo ? <Film className="size-3" aria-hidden /> : <ImageIcon className="size-3" aria-hidden />}
            {isVideo ? "Video" : "Photo"}
            {total > 1 ? ` ${item.index + 1}/${total}` : null}
          </Badge>
          {duration ? <Badge tone="neutral" className="bg-black/60 backdrop-blur-md">{duration}</Badge> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {item.variants.length > 1 ? (
          <div role="radiogroup" aria-label="Quality" className="flex flex-wrap gap-1.5">
            {item.variants.map((v) => {
              const selected = v.id === variant?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setVariantId(v.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition-all",
                    selected ? "bg-brand/15 text-brand-soft ring-brand/50" : "text-muted ring-line-strong hover:text-fg",
                  )}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        ) : variant ? (
          <p className="text-xs font-semibold text-muted">{variant.label}</p>
        ) : null}

        {variant?.note ? (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
            {variant.hasAudio === false ? <VolumeX className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
            {variant.note}
          </p>
        ) : null}

        {variant ? (
          <div className="mt-auto flex flex-wrap gap-2">
            <ButtonLink href={mediaUrl(variant.token, { download: true })} download={variant.filename} size="sm" className="flex-1">
              <Download className="size-4" aria-hidden />
              Download {variant.ext.toUpperCase()}
            </ButtonLink>
            {!isVideo && variant.ext !== "gif" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={convertPng}
                disabled={pngState === "working"}
                title="Converted to PNG in your browser"
              >
                {pngState === "working" ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : (
                  <FileImage className="size-4" aria-hidden />
                )}
                PNG
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-auto text-xs text-muted">Preview only — no downloadable file is available for this item.</p>
        )}
        {audioSource ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="mr-auto inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
              <AudioLines className="size-3.5" aria-hidden />
              Audio only
            </span>
            {(["mp3", "m4a"] as const).map((f) => (
              <Button
                key={f}
                variant="secondary"
                size="sm"
                onClick={() => convertAudio(f)}
                disabled={audioState.busy !== null}
                title={f === "mp3" ? "MP3 — plays everywhere" : "M4A — original audio, no re-encoding"}
              >
                {audioState.busy === f ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                {audioState.busy === f ? "Converting…" : f.toUpperCase()}
              </Button>
            ))}
          </div>
        ) : silent ? (
          <p className="flex items-center gap-1.5 border-t border-line pt-3 text-xs text-muted">
            <VolumeX className="size-3.5" aria-hidden />
            No audio track — nothing to extract.
          </p>
        ) : null}
        {audioState.error ? (
          <p className="text-xs text-danger" role="alert">
            {audioState.error}
          </p>
        ) : null}
        {pngState === "error" ? (
          <p className="text-xs text-danger" role="alert">
            PNG conversion failed. Try the original download instead.
          </p>
        ) : null}
      </div>
    </article>
  );
}
