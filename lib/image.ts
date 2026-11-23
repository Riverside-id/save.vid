import { mediaUrl } from "./api-client";

/**
 * Converts an image to PNG in the browser (no server work) and downloads it.
 * The source is fetched through our same-origin proxy so the canvas is not tainted.
 */
export async function downloadAsPng(token: string, filename: string): Promise<void> {
  const res = await fetch(mediaUrl(token), { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load image (HTTP ${res.status})`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser");
    ctx.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"),
    );
    const href = URL.createObjectURL(png);
    const a = document.createElement("a");
    a.href = href;
    a.download = toPngName(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } finally {
    bitmap.close();
  }
}

export function toPngName(filename: string): string {
  const stem = filename.replace(/\.[A-Za-z0-9]{2,5}$/, "");
  return `${stem || "social-saver"}.png`;
}
