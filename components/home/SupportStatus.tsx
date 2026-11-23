import { CircleCheck, CircleDashed, Eye, Ban } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { SUPPORT_MATRIX, SUPPORT_VERIFIED_ON, type SupportStatus as Status } from "@/lib/support";

const STATUS: Record<Status, { label: string; tone: "success" | "pink" | "neutral" | "warning"; icon: typeof CircleCheck }> = {
  working: { label: "Working", tone: "success", icon: CircleCheck },
  preview: { label: "Preview only", tone: "warning", icon: Eye },
  unavailable: { label: "Not available", tone: "neutral", icon: Ban },
  untested: { label: "Not verified", tone: "neutral", icon: CircleDashed },
};

export function SupportStatus() {
  return (
    <section id="support" className="border-t border-line">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Honest support status"
          title="What works today"
          description="Platforms change often. This table reflects real tests, not marketing — and we'd rather say “not yet” than show a fake button."
        />
        <div className="mt-10 overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
          <ul className="divide-y divide-line">
            {SUPPORT_MATRIX.map((row) => {
              const s = STATUS[row.status];
              const Icon = s.icon;
              return (
                <li key={`${row.platform}-${row.feature}`} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-muted">{row.platform}</span>
                    <span className="font-semibold">{row.feature}</span>
                  </div>
                  <div className="flex flex-col gap-1 sm:max-w-sm sm:items-end sm:text-right">
                    <Badge tone={s.tone} className="self-start sm:self-end">
                      <Icon className="size-3" aria-hidden />
                      {s.label}
                    </Badge>
                    <p className="text-xs leading-relaxed text-muted">{row.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          {SUPPORT_VERIFIED_ON === "pending" ? "Verification pending." : `Last verified: ${SUPPORT_VERIFIED_ON}.`} Public posts
          only — private, age-restricted or login-gated content is never accessed.
        </p>
      </div>
    </section>
  );
}
