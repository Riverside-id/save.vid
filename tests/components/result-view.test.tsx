// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResultView } from "@/components/downloader/ResultView";
import type { ResolveSuccess } from "@/lib/types";

afterEach(cleanup);

const base: ResolveSuccess = {
  ok: true,
  platform: "instagram",
  sourceUrl: "https://www.instagram.com/p/abcdef/",
  postType: "carousel",
  author: { username: "creator", displayName: "Creator" },
  caption: "A caption",
  downloadable: true,
  notice: null,
  extractor: { name: "yt-dlp", version: "test" },
  items: [0, 1].map((index) => ({
    index,
    kind: "image" as const,
    width: 1080,
    height: 1350,
    durationSeconds: null,
    previewToken: `prev${index}`,
    variants: [
      { id: "jpg-full", label: "JPG · 1080×1350", ext: "jpg" as const, mime: "image/jpeg", width: 1080, height: 1350, hasAudio: null, note: null, filename: `p${index}.jpg`, token: `tok${index}` },
    ],
  })),
};

describe("ResultView", () => {
  it("renders real download links, a PNG option and a ZIP button for carousels", () => {
    render(<ResultView data={base} />);
    const links = screen.getAllByRole("link", { name: /Download JPG/ });
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/api/media?t=tok0&dl=1", "/api/media?t=tok1&dl=1"]);
    expect(links[0]!.getAttribute("download")).toBe("p0.jpg");
    expect(screen.getAllByRole("button", { name: /PNG/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Download all photos \(ZIP\)/ })).toBeTruthy();
    expect(screen.getByText("@creator")).toBeTruthy();
  });

  it("never shows a download button when nothing is downloadable", () => {
    render(<ResultView data={{ ...base, downloadable: false, notice: "Preview only", items: [{ ...base.items[0]!, variants: [] }] }} />);
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /ZIP/ })).toBeNull();
    expect(screen.getByText("Preview only")).toBeTruthy();
  });
});
