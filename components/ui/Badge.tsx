import { cn } from "./cn";

type Tone = "pink" | "neutral" | "success" | "warning";

const tones: Record<Tone, string> = {
  pink: "bg-brand/12 text-brand-soft ring-brand/25",
  neutral: "bg-white/5 text-muted ring-line-strong",
  success: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  warning: "bg-amber-400/10 text-amber-200 ring-amber-400/25",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
