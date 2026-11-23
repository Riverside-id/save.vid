"use client";

import { useRef } from "react";
import { ArrowDownToLine, CircleAlert, CircleCheck, ClipboardPaste, Link2, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { Platform } from "@/lib/types";
import type { LinkDetection } from "@/lib/url";
import { PlatformGlyph, PLATFORM_LABEL } from "./PlatformGlyph";

const PLACEHOLDER: Record<Platform, string> = {
  instagram: "Paste an Instagram, TikTok or Pinterest link…",
  tiktok: "Paste a TikTok, Instagram or Pinterest link…",
  pinterest: "Paste a Pinterest, Instagram or TikTok link…",
};

/** Live badge inside the input: shows which platform the pasted link belongs to. */
function DetectionBadge({ detection }: { detection: LinkDetection }) {
  if (detection.state === "ready" || detection.state === "partial") {
    const ready = detection.state === "ready";
    return (
      <span
        data-testid="link-detection"
        data-platform={detection.platform}
        title={ready ? `${detection.label} detected` : `${PLATFORM_LABEL[detection.platform]} link`}
        className={cn(
          "inline-flex h-8 shrink-0 animate-fade-up items-center gap-1.5 rounded-full pl-1.5 pr-2.5 text-xs font-bold ring-1 transition-colors",
          ready ? "bg-brand/15 text-brand-soft ring-brand/40" : "bg-white/5 text-muted ring-line-strong",
        )}
      >
        <span className={cn("grid size-5 place-items-center rounded-full", ready ? "bg-brand text-white" : "bg-white/10 text-fg")}>
          <PlatformGlyph platform={detection.platform} className="size-3" />
        </span>
        <span className="hidden sm:inline">{PLATFORM_LABEL[detection.platform]}</span>
      </span>
    );
  }
  return <Link2 className="size-5 shrink-0 text-muted" aria-hidden />;
}

export function UrlForm({
  platform,
  value,
  onChange,
  onSubmit,
  loading,
  detection,
  hint,
  error,
}: {
  platform: Platform;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  detection: LinkDetection;
  /** Default helper text when nothing is typed. */
  hint: string;
  /** Error shown after a submit attempt. */
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
      inputRef.current?.focus();
    } catch {
      inputRef.current?.focus();
    }
  }

  const status: { tone: "muted" | "ok" | "warn" | "error"; text: string } = error
    ? { tone: "error", text: error }
    : detection.state === "ready"
      ? { tone: "ok", text: `${detection.label} detected — ready to download.` }
      : detection.state === "partial"
        ? { tone: "warn", text: `${PLATFORM_LABEL[detection.platform]} link detected. ${detection.message}` }
        : detection.state === "unknown"
          ? { tone: "warn", text: "This doesn't look like an Instagram, TikTok or Pinterest link yet." }
          : { tone: "muted", text: hint };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mt-4"
    >
      <label htmlFor="post-url" className="sr-only">
        Post URL
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div
          className={cn(
            "flex min-h-14 flex-1 items-center gap-2 rounded-2xl bg-canvas pl-3 pr-2 ring-1 transition-all duration-200 focus-within:ring-2 sm:pl-3.5",
            status.tone === "error"
              ? "ring-danger/60 focus-within:ring-danger/70"
              : status.tone === "ok"
                ? "ring-brand/50 focus-within:ring-brand/70"
                : "ring-line-strong focus-within:ring-brand/70",
          )}
        >
          <DetectionBadge detection={detection} />
          <input
            ref={inputRef}
            id="post-url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={PLACEHOLDER[platform]}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={status.tone === "error"}
            aria-describedby="post-url-hint"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-muted/60 focus:outline-none focus-visible:outline-none"
          />
          {value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear link"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-fg"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={paste}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted ring-1 ring-line-strong transition-colors hover:text-brand-soft hover:ring-brand/50"
            >
              <ClipboardPaste className="size-3.5" aria-hidden />
              Paste
            </button>
          )}
        </div>
        <Button type="submit" size="lg" disabled={loading} className="h-14 rounded-2xl px-7 sm:min-w-44">
          {loading ? (
            <>
              <LoaderCircle className="size-5 animate-spin" aria-hidden />
              Processing…
            </>
          ) : (
            <>
              <ArrowDownToLine className="size-5" aria-hidden />
              Download Now
            </>
          )}
        </Button>
      </div>
      <p
        id="post-url-hint"
        className={cn(
          "mt-2.5 flex min-h-5 items-start gap-1.5 px-1 text-[13px]",
          status.tone === "error" && "text-danger",
          status.tone === "ok" && "text-brand-soft",
          status.tone === "warn" && "text-amber-200/90",
          status.tone === "muted" && "text-muted",
        )}
        aria-live="polite"
      >
        {status.tone === "ok" ? <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
        {status.tone === "error" || status.tone === "warn" ? <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}
        <span>{status.text}</span>
      </p>
    </form>
  );
}
