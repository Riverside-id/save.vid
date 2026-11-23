// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Downloader } from "@/components/downloader/Downloader";

afterEach(cleanup);

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Post URL"), { target: { value } });
}

describe("URL field platform detection", () => {
  it("detects an Instagram reel and keeps the Instagram tab", () => {
    render(<Downloader />);
    type("https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc");
    expect(screen.getByTestId("link-detection").dataset.platform).toBe("instagram");
    expect(screen.getByText(/Instagram Reel detected/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Instagram/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("detects a TikTok video and switches the tab automatically", () => {
    render(<Downloader />);
    type("https://www.tiktok.com/@creator/video/7047596209028074758");
    expect(screen.getByTestId("link-detection").dataset.platform).toBe("tiktok");
    expect(screen.getByText(/TikTok video detected/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: /TikTok/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("warns about incomplete or foreign links without a badge", () => {
    render(<Downloader />);
    type("https://www.tiktok.com/@creator");
    expect(screen.getByText(/TikTok link detected\. Use a link to a single TikTok video or photo post\./)).toBeTruthy();
    type("https://example.com/video");
    expect(screen.queryByTestId("link-detection")).toBeNull();
    expect(screen.getByText(/doesn't look like an Instagram or TikTok link/)).toBeTruthy();
  });
});
