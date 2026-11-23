import { ArrowDownToLine } from "lucide-react";
import { cn } from "./cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-xl bg-brand text-canvas shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_8px_24px_-8px_rgb(236_72_153/0.6)]"
      >
        <ArrowDownToLine className="size-5" strokeWidth={2.5} />
      </span>
      <span className="text-[17px] font-extrabold tracking-tight">
        Social <span className="text-brand-soft">Saver</span>
      </span>
    </span>
  );
}
