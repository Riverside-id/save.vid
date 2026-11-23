import { CircleAlert, Clock, Lock, RotateCcw, SearchX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ClientErrorCode } from "@/lib/api-client";

const TITLES: Partial<Record<ClientErrorCode, string>> = {
  INVALID_URL: "That link doesn't look right",
  UNSUPPORTED_URL: "This kind of link isn't supported",
  RATE_LIMITED: "Slow down a little",
  NOT_FOUND: "Post not found",
  LOGIN_REQUIRED: "This post isn't public",
  UPSTREAM_BLOCKED: "The platform is limiting requests",
  UPSTREAM_ERROR: "The platform returned an error",
  TIMEOUT: "That took too long",
  NO_MEDIA: "No downloadable media found",
  NETWORK: "You seem to be offline",
  MISCONFIGURED: "Service unavailable",
};

function ErrorIcon({ code }: { code: ClientErrorCode }) {
  const props = { className: "size-5", "aria-hidden": true } as const;
  switch (code) {
    case "LOGIN_REQUIRED":
      return <Lock {...props} />;
    case "RATE_LIMITED":
    case "TIMEOUT":
      return <Clock {...props} />;
    case "NOT_FOUND":
    case "NO_MEDIA":
      return <SearchX {...props} />;
    case "UPSTREAM_BLOCKED":
      return <ShieldAlert {...props} />;
    default:
      return <CircleAlert {...props} />;
  }
}

export function ErrorState({
  code,
  message,
  retryAfterSeconds,
  onRetry,
}: {
  code: ClientErrorCode;
  message: string;
  retryAfterSeconds?: number;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="mt-2 flex animate-fade-up flex-col gap-4 rounded-2xl bg-danger/[0.06] p-4 ring-1 ring-danger/25 sm:flex-row sm:items-center sm:p-5">
      <div className="flex flex-1 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
          <ErrorIcon code={code} />
        </span>
        <div>
          <p className="font-semibold">{TITLES[code] ?? "Something went wrong"}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            {message}
            {retryAfterSeconds ? ` (try again in ~${retryAfterSeconds}s)` : null}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="self-start sm:self-center">
          <RotateCcw className="size-4" aria-hidden />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
