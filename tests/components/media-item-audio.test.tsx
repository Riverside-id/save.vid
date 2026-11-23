// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MediaItemCard } from "@/components/downloader/MediaItemCard";
import type { MediaItem, MediaVariant } from "@/lib/types";

afterEach(cleanup);

const variant = (hasAudio: boolean | null): MediaVariant => ({
  id: "v",
  label: "MP4 · 576×1024",
  ext: "mp4",
  mime: "video/mp4",
  width: 576,
  height: 1024,
  hasAudio,
  note: null,
  filename: "v.mp4",
  token: "tok",
});
const item = (v: MediaVariant, kind: "video" | "image" = "video"): MediaItem => ({
  index: 0,
  kind,
  width: 576,
  height: 1024,
  durationSeconds: 21,
  previewToken: null,
  variants: [v],
});

describe("MediaItemCard audio options", () => {
  it("offers MP3 and M4A for videos that can have sound", () => {
    render(<MediaItemCard item={item(variant(null))} total={1} />);
    expect(screen.getByRole("button", { name: "MP3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "M4A" })).toBeTruthy();
  });

  it("explains instead of offering buttons when the video is silent", () => {
    render(<MediaItemCard item={item(variant(false))} total={1} />);
    expect(screen.queryByRole("button", { name: "MP3" })).toBeNull();
    expect(screen.getByText(/No audio track/)).toBeTruthy();
  });

  it("shows no audio options for photos", () => {
    render(<MediaItemCard item={item({ ...variant(null), ext: "jpg", mime: "image/jpeg" }, "image")} total={1} />);
    expect(screen.queryByRole("button", { name: "MP3" })).toBeNull();
  });
});
