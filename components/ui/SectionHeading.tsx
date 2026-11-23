export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {description ? <p className="mt-3 text-pretty text-[15px] leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}
