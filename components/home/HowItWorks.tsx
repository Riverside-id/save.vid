import { ClipboardPaste, Download, ScanSearch } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";

const STEPS = [
  { icon: ClipboardPaste, title: "Copy & paste the link", body: "Open the post, tap Share → Copy link, then paste it above." },
  { icon: ScanSearch, title: "Preview the media", body: "We fetch the public post and show every photo and video inside." },
  { icon: Download, title: "Pick a format & save", body: "Choose an available quality, then download the file or a ZIP." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="How it works" title="Three steps. About ten seconds." />
        <ol className="mt-12 grid gap-3 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="relative rounded-3xl bg-surface p-6 ring-1 ring-line">
              <span className="absolute right-5 top-5 text-4xl font-extrabold text-white/[0.06]" aria-hidden>
                0{i + 1}
              </span>
              <span className="grid size-11 place-items-center rounded-2xl bg-white/5 text-brand-soft ring-1 ring-line-strong">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-base font-bold">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
