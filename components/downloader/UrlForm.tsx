"use client";

import { useRef } from "react";
import { ArrowDownToLine, ClipboardPaste, Link2, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { Platform } from "@/lib/types";

const PLACEHOLDER: Record<Platform, string> = {
  instagram: "https://www.instagram.com/reel/…",
  tiktok: "https://www.tiktok.com/@user/video/…",
};

export function UrlForm({
  platform,
  value,
  onChange,
  onSubmit,
  loading,
  hint,
  hintTone,
}: {
  platform: Platform;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
  hint: string | null;
  hintTone: "muted" | "error";
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
            "flex min-h-14 flex-1 items-center gap-2 rounded-2xl bg-canvas px-4 ring-1 transition-all duration-200 focus-within:ring-2",
            hintTone === "error" ? "ring-danger/60 focus-within:ring-danger/70" : "ring-line-strong focus-within:ring-brand/70",
          )}
        >
          <Link2 className="size-5 shrink-0 text-muted" aria-hidden />
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
            aria-invalid={hintTone === "error"}
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
        className={cn("mt-2.5 min-h-5 px-1 text-[13px]", hintTone === "error" ? "text-danger" : "text-muted")}
        aria-live="polite"
      >
        {hint}
      </p>
    </form>
  );
}
