import { Logo } from "@/components/ui/Logo";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">
            Social Saver helps you keep a copy of public posts you have the right to save. Respect creators: only download
            content you own, have permission to use, or that is licensed for reuse.
          </p>
        </div>
        <div className="text-sm leading-relaxed text-muted md:text-right">
          <p>No accounts. No cookies stored. No media kept on our servers.</p>
          <p className="mt-2">Social Saver is not affiliated with, endorsed by, or sponsored by Instagram, Meta, TikTok or Pinterest.</p>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted/80 sm:px-6">
          © {new Date().getFullYear()} Social Saver. All trademarks belong to their respective owners.
        </p>
      </div>
    </footer>
  );
}
