# Social Saver

**Save Your Favorite Moments.** Website untuk menyimpan video dan foto dari postingan **publik** Instagram, TikTok, dan Pinterest: tempel link → lihat preview → unduh file asli.

Tema Black & Pink · Next.js (App Router) + TypeScript + Tailwind CSS · Python (yt-dlp) · siap di-deploy ke Vercel.

> Gunakan hanya untuk konten milik Anda sendiri, konten yang Anda punya izin untuk menggunakannya, atau yang berlisensi untuk dipakai ulang. Social Saver tidak mengakses konten privat, tidak meminta login/cookie, dan tidak melewati proteksi apa pun.

## Status dukungan (diuji nyata 23 Nov 2026, lokal)

| Platform | Fitur | Status |
|---|---|---|
| Instagram | Reels, video | ✅ MP4 asli dari CDN Instagram |
| Instagram | Foto | ✅ JPG ukuran penuh; PNG (dikonversi di browser) |
| Instagram | Carousel + ZIP | ✅ |
| TikTok | Video | ✅ sumber tanpa watermark (tanpa overlay TikTok) |
| TikTok | Slideshow foto | ✅ semua foto ukuran asli, tanpa watermark; bisa ZIP |
| Pinterest | Pin video | ✅ MP4 kualitas terbaik dengan audio |
| Pinterest | Pin gambar | ✅ file asli ukuran penuh (bukan crop/resize) |
| Pinterest | Pin yang menyematkan YouTube/Vimeo | ❌ tidak didukung |

Detail & bukti: [`docs/TESTING.md`](docs/TESTING.md). Arsitektur & alasan teknis: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Tentang watermark:** yang ditawarkan hanya sumber tanpa watermark tambahan dari platform. Logo/teks yang sudah menjadi bagian dari rekaman asli kreator tetap ada. Bila platform hanya menyediakan versi ber-watermark, versi itu tidak ditawarkan.

## Arsitektur singkat

| Bagian | Lokasi | Runtime |
|---|---|---|
| UI | `app/`, `components/` | Next.js |
| Resolver Instagram & Pinterest | `api/resolve.py`, `api/_lib/` | Vercel Python Function + yt-dlp |
| Resolver TikTok | `app/api/tiktok/route.ts`, `lib/server/tiktok.ts` | Node |
| Proxy media (streaming, Range) | `app/api/media/route.ts` | Node |
| ZIP streaming | `app/api/zip/route.ts` | Node |
| Kontrak API (types) | `lib/types.ts` | — |

## Menjalankan secara lokal

Prasyarat: Node.js ≥ 20.9, Python ≥ 3.12.

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
npm run setup        # membuat .env.local dengan MEDIA_TOKEN_SECRET acak
npm run dev          # Next.js (http://localhost:3000) + resolver Python (127.0.0.1:8000)
```

> macOS dengan Python dari python.org: jika muncul error sertifikat SSL, `scripts/run-python.mjs` otomatis memakai `/etc/ssl/cert.pem`.

## Pengujian

```bash
npm run lint
npm run typecheck
npm run test         # Vitest (unit, integrasi route, komponen)
npm run test:py      # pytest
npm run build
npm run check        # semua di atas sekaligus
npm run test:live -- <url-postingan-publik>   # uji nyata terhadap server yang sedang berjalan
```

## Environment

Lihat [`.env.example`](.env.example).

| Variabel | Wajib | Keterangan |
|---|---|---|
| `MEDIA_TOKEN_SECRET` | ✅ | Secret HMAC (≥ 32 karakter) untuk token media. Dipakai Python **dan** Node. |
| `MEDIA_TOKEN_TTL_SECONDS` | | Masa berlaku token (default 3600). |
| `MAX_MEDIA_MB`, `MAX_ZIP_MB`, `MAX_ZIP_ITEMS` | | Batas ukuran (default 250 MB / 300 MB / 20 file). |
| `RATE_LIMIT_RESOLVE_PER_MIN`, `RATE_LIMIT_MEDIA_PER_MIN`, `RATE_LIMIT_ZIP_PER_MIN` | | Rate limit per IP. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | | Rate limit terdistribusi (disarankan untuk produksi). |
| `PYTHON_API_URL` | | **Hanya lokal.** Jangan di-set di Vercel. |

## Deploy ke Vercel

1. Import repository di Vercel (framework terdeteksi: Next.js). `vercel.json` sudah mengatur Python Function `api/resolve.py`.
2. Set Environment Variables: minimal `MEDIA_TOKEN_SECRET` (buat baru, jangan pakai nilai lokal). Disarankan juga Upstash Redis.
3. Deploy sebagai **Preview** dulu, lalu jalankan:
   ```bash
   BASE_URL=https://<preview>.vercel.app npm run test:live -- <url-reel-ig> <url-video-tiktok>
   ```
4. Promote ke Production hanya setelah uji di atas lulus. IP datacenter bisa diperlakukan berbeda oleh Instagram/TikTok — bila diblokir, lihat opsi worker di `docs/ARCHITECTURE.md`.

## Struktur folder

```
api/                 Vercel Python Function (resolver Instagram) + _lib (validasi, token, rate limit, yt-dlp)
app/                 Halaman & route handler Next.js (media, zip, tiktok)
components/          UI reusable (ui/, layout/, home/, downloader/)
lib/                 Types, validasi URL klien, API client, server utils (token, allowlist, upstream, tiktok)
tests/               Vitest (unit, integration, components, fixtures)
tests_py/            pytest
shared/              Vektor uji token lintas bahasa
scripts/             Dev server Python, setup env, live check
docs/                Arsitektur & pengujian
```

## Pemeliharaan

Platform sering berubah. Jika ekstraksi Instagram gagal massal: perbarui `yt-dlp` di `requirements.txt`, jalankan `npm run test:py` dan uji live, lalu deploy. Jika struktur halaman TikTok berubah, sesuaikan `lib/server/tiktok.ts` (+ fixture di `tests/fixtures/tiktok.ts`).
