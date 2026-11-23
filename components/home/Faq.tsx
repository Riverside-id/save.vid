import { ChevronDown } from "lucide-react";
import { SectionHeading } from "@/components/ui/SectionHeading";

const FAQ = [
  {
    q: "Is Social Saver free?",
    a: "Yes. There is no account, subscription or app to install.",
  },
  {
    q: "Can I download from private accounts or stories?",
    a: "No. Social Saver only works with posts that anyone can view without logging in. We never ask for your password or cookies and we never try to get around access controls.",
  },
  {
    q: "Are downloads watermark-free?",
    a: "We only offer sources without a platform-added watermark: Instagram's original CDN file, and for TikTok the playback source instead of TikTok's watermarked “download” version (we verified the difference frame by frame). Logos or text that are part of the creator's original upload are part of the content and stay — we don't edit anyone's work.",
  },
  {
    q: "Does it work with TikTok?",
    a: "Yes, for public videos and photo posts. Social Saver reads the public post the same way for everyone, with an honest user agent. If TikTok answers with a bot check instead, we tell you — we never try to get around it.",
  },
  {
    q: "Which formats can I get?",
    a: "Videos come as MP4 and photos as JPG, in the qualities the platform actually provides for that post. You can also convert a photo to PNG — that happens in your own browser.",
  },
  {
    q: "Do you keep a copy of what I download?",
    a: "No. Files are streamed from the platform straight to you. Nothing is written to permanent storage, and we don't keep a history of links.",
  },
  {
    q: "Can I reuse what I download?",
    a: "Only if you have the right to. Content belongs to its creators. Download your own posts, content you have permission to use, or material licensed for reuse — and credit the creator.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t border-line">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="mt-10 space-y-2.5">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group rounded-2xl bg-surface ring-1 ring-line transition-all open:ring-brand/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-180 group-open:text-brand-soft" aria-hidden />
              </summary>
              <p className="-mt-1 px-5 pb-5 text-sm leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
