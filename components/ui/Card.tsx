import { cn } from "./cn";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-3xl bg-surface ring-1 ring-line", className)}>{children}</div>;
}
