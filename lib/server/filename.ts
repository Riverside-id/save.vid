/** Defense-in-depth filename sanitizer for Content-Disposition (resolver already sanitizes). */
export function sanitizeFilename(input: string, fallback = "social-saver"): string {
  const ascii = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+/, "")
    .slice(0, 160);
  const cleaned = ascii.replace(/[-._]+$/, "");
  return cleaned && /[A-Za-z0-9]/.test(cleaned) ? cleaned : fallback;
}

export function contentDisposition(type: "attachment" | "inline", filename: string): string {
  const safe = sanitizeFilename(filename);
  return `${type}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Ensures unique names inside a ZIP archive. */
export function uniqueName(name: string, used: Set<string>): string {
  let candidate = name;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const dot = name.lastIndexOf(".");
    candidate = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
