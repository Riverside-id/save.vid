#!/usr/bin/env node
/**
 * Opt-in live check against a RUNNING Social Saver (default http://localhost:3000).
 * Usage: npm run test:live -- <post-url> [<post-url> ...]
 *        BASE_URL=https://your-preview.vercel.app npm run test:live -- <post-url>
 * Only use public posts you are allowed to download. Prints real results — nothing is mocked.
 */
const base = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("Pass one or more public post URLs.");
  process.exit(2);
}

let failed = 0;
for (const url of urls) {
  const endpoint = /tiktok\.com/i.test(url) ? "/api/tiktok" : "/api/resolve";
  const started = Date.now();
  try {
    const res = await fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ url }),
    });
    const body = await res.json();
    if (!body.ok) {
      failed++;
      console.log(`✗ ${url}\n  ${res.status} ${body.error.code}: ${body.error.message}`);
      continue;
    }
    console.log(`✓ ${url} (${Date.now() - started} ms) ${body.platform}/${body.postType} · ${body.items.length} item(s)`);
    for (const item of body.items) {
      const v = item.variants[0];
      if (!v) {
        console.log(`  - #${item.index + 1} ${item.kind}: preview only`);
        continue;
      }
      const media = await fetch(`${base}/api/media?t=${encodeURIComponent(v.token)}`, { headers: { Range: "bytes=0-1023" } });
      await media.body?.cancel();
      const ok = media.status === 200 || media.status === 206;
      if (!ok) failed++;
      console.log(`  ${ok ? "✓" : "✗"} #${item.index + 1} ${item.kind} ${v.label} → HTTP ${media.status} ${media.headers.get("content-type")}`);
    }
  } catch (err) {
    failed++;
    console.log(`✗ ${url}\n  ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
