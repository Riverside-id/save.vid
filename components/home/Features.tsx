import { AudioLines, Eye, FolderDown, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Original source files",
    body: "We hand you the file the platform serves — no re-encoding, no added branding, only formats that really exist.",
  },
  {
    icon: Eye,
    title: "Preview before you save",
    body: "See every photo and video in a post before downloading anything.",
  },
  {
    icon: AudioLines,
    title: "Video to audio",
    body: "Turn any Instagram, TikTok or Pinterest video into an MP3, or keep the original audio as M4A.",
  },
  {
    icon: FolderDown,
    title: "Carousels as ZIP",
    body: "Grab every item of a multi-photo post in a single streamed ZIP file.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    body: "No login, no cookies collected, and media is streamed through — never stored.",
  },
  {
    icon: Gauge,
    title: "Fast on any screen",
    body: "Built mobile-first, so it feels just as quick on your phone as on desktop.",
  },
];

export function Features() {
  return (
    <section id="features" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need, nothing you don't"
          description="A focused tool that respects your time, your privacy and the people who make the content."
        />
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-3xl bg-surface p-6 ring-1 ring-line transition-all duration-300 hover:-translate-y-0.5 hover:ring-brand/35"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-brand/12 text-brand-soft ring-1 ring-brand/25 transition-colors group-hover:bg-brand group-hover:text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-base font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
