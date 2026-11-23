import { Logo } from "@/components/ui/Logo";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#support", label: "Support" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/75 backdrop-blur-xl supports-[backdrop-filter]:bg-canvas/60">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" aria-label="Social Saver home" className="rounded-xl">
          <Logo />
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-white/5 hover:text-fg"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#download"
          className="inline-flex h-9 items-center rounded-full bg-white/[0.06] px-4 text-sm font-semibold text-fg ring-1 ring-line-strong transition-all hover:bg-brand hover:ring-brand"
        >
          Start saving
        </a>
      </nav>
    </header>
  );
}
