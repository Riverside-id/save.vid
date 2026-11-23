"use client";

import { useState } from "react";
import { ExternalLink, FolderDown, Info } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { submitZipDownload } from "@/lib/api-client";
import type { ResolveSuccess } from "@/lib/types";
import { MediaItemCard } from "./MediaItemCard";
import { PlatformGlyph, PLATFORM_LABEL } from "./PlatformGlyph";

const POST_TYPE_LABEL: Record<ResolveSuccess["postType"], string> = {
  video: "Video",
  image: "Photo",
  carousel: "Carousel",
  unknown: "Post",
};

export function ResultView({ data }: { data: ResolveSuccess }) {
  const zipTokens = data.items.flatMap((i) => (i.variants[0] ? [i.variants[0].token] : []));
  const allImages = data.items.every((i) => i.kind === "image");
  const zipName = [data.platform, data.author.username, "post"].filter(Boolean).join("_");
  const handle = data.author.username ? `@${data.author.username}` : null;
  const [zipState, setZipState] = useState<{ status: "idle" | "started" } | { status: "error"; message: string }>({
    status: "idle",
  });

  function startZip() {
    setZipState({ status: "started" });
    submitZipDownload(zipTokens, zipName, (message) => setZipState({ status: "error", message }));
  }

  return (
    <section aria-label="Result" className="mt-2 animate-fade-up">
      <header className="flex flex-col gap-3 rounded-2xl bg-canvas/60 p-4 ring-1 ring-line sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-soft ring-1 ring-brand/30">
            <PlatformGlyph platform={data.platform} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{handle ?? data.author.displayName ?? PLATFORM_LABEL[data.platform]}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="pink">{PLATFORM_LABEL[data.platform]}</Badge>
              <Badge>{POST_TYPE_LABEL[data.postType]}</Badge>
              {data.items.length > 1 ? <Badge>{data.items.length} items</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.downloadable && zipTokens.length > 1 ? (
            <Button size="sm" onClick={startZip}>
              <FolderDown className="size-4" aria-hidden />
              {allImages ? "Download all photos (ZIP)" : "Download all (ZIP)"}
            </Button>
          ) : null}
          <a
            href={data.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-muted ring-1 ring-line-strong transition-colors hover:text-fg"
          >
            Open post
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </header>

      {zipState.status === "started" ? (
        <p className="mt-2 px-1 text-xs text-muted" aria-live="polite">
          Your ZIP is being prepared and will start downloading shortly…
        </p>
      ) : null}
      {zipState.status === "error" ? (
        <p className="mt-2 px-1 text-xs text-danger" role="alert">
          ZIP download failed: {zipState.message}
        </p>
      ) : null}

      {data.caption ? <p className="mt-3 line-clamp-3 px-1 text-sm leading-relaxed text-muted">{data.caption}</p> : null}

      {data.notice ? (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-400/[0.06] p-3.5 text-sm leading-relaxed text-amber-100/90 ring-1 ring-amber-400/20">
          <Info className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
          {data.notice}
        </p>
      ) : null}

      <div className={data.items.length > 1 ? "mt-3 grid gap-3 sm:grid-cols-2" : "mx-auto mt-3 max-w-sm"}>
        {data.items.map((item) => (
          <MediaItemCard key={item.index} item={item} total={data.items.length} />
        ))}
      </div>

      <p className="mt-4 px-1 text-xs leading-relaxed text-muted/80">
        Only download content you own or have permission to use. Files are streamed directly from the platform — Social
        Saver does not store them.
      </p>
    </section>
  );
}
