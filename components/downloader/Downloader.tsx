"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { resolveUrl, type ClientErrorCode } from "@/lib/api-client";
import type { Platform, ResolveSuccess } from "@/lib/types";
import { checkUrl, detectPlatform } from "@/lib/url";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { PlatformTabs } from "./PlatformTabs";
import { ResultView } from "./ResultView";
import { UrlForm } from "./UrlForm";

type State =
  | { status: "idle" }
  | { status: "loading"; platform: Platform }
  | { status: "success"; data: ResolveSuccess }
  | { status: "error"; code: ClientErrorCode; message: string; retryAfterSeconds?: number };

const HINTS: Record<Platform, string> = {
  instagram: "Public posts, reels, videos and carousels. Private accounts and stories are not supported.",
  tiktok: "Public TikTok videos and photo posts, from TikTok's watermark-free source.",
};

export function Downloader() {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [inlineError, setInlineError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleChange = useCallback(
    (value: string) => {
      setUrl(value);
      setInlineError(null);
      const detected = detectPlatform(value);
      if (detected && detected !== platform) setPlatform(detected);
    },
    [platform],
  );

  const submit = useCallback(async () => {
    const check = checkUrl(url);
    if (!check.ok) {
      setInlineError(check.message);
      return;
    }
    setInlineError(null);
    setPlatform(check.platform);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "loading", platform: check.platform });

    try {
      const res = await resolveUrl(url.trim(), check.platform, controller.signal);
      if (controller.signal.aborted) return;
      if (res.ok) setState({ status: "success", data: res });
      else
        setState({
          status: "error",
          code: res.error.code,
          message: res.error.message,
          retryAfterSeconds: res.error.retryAfterSeconds,
        });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setState({ status: "error", code: "INTERNAL", message: "Something went wrong. Please try again." });
    }
  }, [url]);

  return (
    <Card className="p-3 shadow-[0_30px_80px_-40px_rgb(236_72_153/0.45)] sm:p-5">
      <PlatformTabs value={platform} onChange={setPlatform} />
      <UrlForm
        platform={platform}
        value={url}
        onChange={handleChange}
        onSubmit={submit}
        loading={state.status === "loading"}
        hint={inlineError ?? HINTS[platform]}
        hintTone={inlineError ? "error" : "muted"}
      />
      {state.status === "loading" ? <LoadingState platform={state.platform} /> : null}
      {state.status === "error" ? (
        <ErrorState
          code={state.code}
          message={state.message}
          retryAfterSeconds={state.retryAfterSeconds}
          onRetry={state.code === "INVALID_URL" || state.code === "UNSUPPORTED_URL" ? undefined : submit}
        />
      ) : null}
      {state.status === "success" ? <ResultView data={state.data} /> : null}
    </Card>
  );
}
