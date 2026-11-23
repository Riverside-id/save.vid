import { Downloader } from "@/components/downloader/Downloader";

export function Hero() {
  return (
    <section id="download" className="relative isolate overflow-hidden">
      {/* single, subtle brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[28rem] max-w-4xl rounded-full bg-[radial-gradient(closest-side,rgb(236_72_153/0.22),transparent)] blur-2xl"
      />
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1 text-xs font-semibold text-muted ring-1 ring-line-strong">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Instagram · TikTok · Pinterest
          </p>
          <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Save Your Favorite{" "}
            <span className="bg-gradient-to-r from-brand to-brand-soft bg-clip-text text-transparent">Moments.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-muted sm:text-base">
            Paste a link to a public post, preview what&apos;s inside and download the original file — or just its audio as
            MP3. No sign-up, no app, nothing stored.
          </p>
        </div>
        <div className="mt-8 sm:mt-10">
          <Downloader />
        </div>
      </div>
    </section>
  );
}
