# Arsitektur & Hasil Investigasi

Dokumen ini mencatat **keputusan arsitektur Social Saver dan alasannya**, berdasarkan pengujian nyata (23 Nov 2026).

## Ringkasan

```
Browser ──POST /api/resolve──▶ Vercel Python Function (api/resolve.py, yt-dlp)   ← Instagram
        ──POST /api/tiktok───▶ Next.js Route Handler (Node)                      ← TikTok
        ◀── JSON: metadata + token media bertanda tangan (HMAC, kedaluwarsa)

Browser ──GET /api/media?t=…──▶ Next.js Route Handler (Node) ──stream──▶ CDN platform
        ──POST /api/zip───────▶ Next.js Route Handler (Node) ──stream ZIP──▶ CDN platform
```

- **Tidak ada penyimpanan.** Media di-stream langsung dari CDN platform ke pengguna; tidak ada file yang ditulis ke disk/penyimpanan permanen.
- **Klien tidak pernah mengirim URL CDN.** Klien hanya memegang *token* yang ditandatangani server (HMAC-SHA256, `MEDIA_TOKEN_SECRET`). Proxy memverifikasi tanda tangan, masa berlaku, allowlist host, dan tipe konten. Tanpa token yang sah, tidak ada request keluar → mencegah SSRF / open proxy.

## Instagram — yt-dlp di Vercel Python Function

| Opsi | Hasil investigasi |
|---|---|
| **yt-dlp (library) di Python Function** ✅ dipilih | Reel, video, foto, dan carousel publik berhasil diekstrak tanpa login. Ekstraktor dirawat komunitas → saat Instagram berubah cukup *bump* versi di `requirements.txt`. Ukuran paket kecil (jauh di bawah batas 500 MB Python Function). |
| Menulis ekstraktor sendiri (meniru API internal Instagram) | Ditolak: rapuh, dan meniru header/aplikasi internal termasuk akses yang tidak sah. |
| gallery-dl | Tidak dipakai: dukungan Instagram-nya pada praktiknya mengandalkan cookie login, sedangkan proyek ini dilarang menyimpan/memakai cookie pengguna. |
| yt-dlp sebagai binary (`yt-dlp_linux`) di Node | Ditolak: build resmi membawa `curl_cffi` (impersonasi browser) yang tidak boleh kita pakai, dan menambah cold start. |

Pengerasan (hardening) di `api/_lib/ytdlp_runner.py`:
- `allowed_extractors=["Instagram"]` → ekstraktor *generic* tidak pernah jalan, jadi yt-dlp tidak bisa diarahkan ke URL sembarang.
- Hanya URL kanonik yang dibangun ulang dari shortcode tervalidasi yang diteruskan (query/fragment dibuang).
- Tanpa cookie, tanpa login, tanpa cache dir, tanpa komentar, `curl_cffi` **tidak** di-install (tanpa impersonasi).
- Timeout keseluruhan (default 22 s) + `socket_timeout`.

Normalisasi (`api/_lib/instagram.py`) hanya menawarkan yang benar-benar ada:
- **Video:** file MP4 progresif (video+audio) asli dari CDN. Rendisi DASH *video-only* hanya ditawarkan bila postingan memang tidak punya audio (tidak ada yang hilang).
- **Foto:** kandidat ukuran penuh saja (tanpa versi kecil). Bila Instagram tidak menyertakan ukuran, kandidat terakhir (ukuran penuh) dipakai dan diberi label *Full size* — ukuran tidak dikarang.
- File proxy diverifikasi **identik byte-per-byte** dengan unduhan langsung dari CDN (MD5 sama).

## Pinterest — yt-dlp di Python Function (sama dengan Instagram)

- yt-dlp membaca pin lewat endpoint web Pinterest untuk pengunjung tanpa login (`unauth_react_main_pin`) — tanpa cookie, login, atau impersonasi. Diuji nyata dengan pin publik dari berbagai situs negara (termasuk `id.pinterest.com`).
- Pin video: satu MP4 progresif terbaik (audio terverifikasi); HLS dilewati; di antara resolusi yang sama, file asli tanpa akhiran tier `_tN` dipilih.
- Pin video yang oleh Pinterest hanya dicantumkan sebagai HLS: MP4 progresif dengan hash path yang sama (`/videos/mc/720p/aa/bb/cc/<hash>.mp4`) dicari di CDN Pinterest dan **hanya ditawarkan setelah probe** (Range 1 KB, harus 200/206 + `video/mp4`). Jika tidak ada, pengguna mendapat pesan jujur dan hanya cover image — tidak pernah tombol palsu.
- Pin gambar: file `originals` (unggahan asli, ukuran penuh). Thumbnail berukuran kotak tetap seperti `600x315` (crop) tidak pernah dipilih.
- Short link `pin.it` diekspansi hop demi hop (`api/_lib/redirects.py`): setiap host divalidasi allowlist + IP publik, hasil akhir harus URL pin yang valid.
- Pin yang hanya menyematkan video YouTube/Vimeo ditolak — yt-dlp dibatasi ke ekstraktor Pinterest saja.

## TikTok — Node, satu sesi per unduhan

Temuan pengujian:
1. Client yang **menyamar sebagai Chrome** (UA palsu / TLS Python) mendapat halaman tantangan bot (± 1,4 KB).
2. Client dengan **User-Agent jujur** (`SocialSaver/0.1`) mendapat halaman publik lengkap berisi data postingan.
3. URL video TikTok hanya berlaku bersama cookie sesi anonim yang diberikan TikTok pada respons halaman itu (tanpa cookie → 403).
4. Ekstraktor TikTok di yt-dlp menyertakan pemecah tantangan WAF (*proof-of-work*) dan header acak anti-deteksi → **tidak dipakai**.

Desain (`lib/server/tiktok.ts`, `app/api/tiktok/route.ts`):
- Membaca halaman publik sekali dengan UA jujur, mengambil data yang disematkan TikTok.
- Token TikTok berisi URL **postingan** (bukan URL CDN). Saat unduh, proxy membaca ulang postingan dalam sesinya sendiri (cache 60 s per instance) lalu men-stream file. Ini juga mengatasi fakta bahwa resolver dan proxy bisa berjalan di instance berbeda.
- Tidak pernah: menyamar sebagai browser, memecahkan tantangan bot, login, atau memakai cookie pengguna. Jika TikTok mengirim tantangan bot, pengguna mendapat pesan jujur (`UPSTREAM_BLOCKED`).
- **Watermark:** hanya sumber `bitrateInfo` / `playAddr`. `downloadAddr` tidak pernah ditawarkan — diverifikasi frame-per-frame bahwa TikTok menambahkan overlay watermark bergerak pada `downloadAddr`, sedangkan `playAddr` tidak. Logo yang merupakan bagian dari rekaman asli kreator tetap ada (kami tidak mengedit karya orang lain).

## Batas Vercel yang diperhitungkan

| Batas | Nilai (dok. Vercel, 2026) | Penanganan |
|---|---|---|
| Ukuran body respons | 4,5 MB, **kecuali respons streaming** | Semua media & ZIP di-stream (`ReadableStream`), tidak di-buffer. |
| Durasi maksimum | Hobby 300 s (Fluid compute) | `maxDuration = 300` untuk `/api/media` & `/api/zip`; 30 s untuk resolver. |
| Ukuran bundle Python | 500 MB | yt-dlp saja (± belasan MB). |
| Ukuran file | — | `MAX_MEDIA_MB` (default 250), `MAX_ZIP_MB` (300), `MAX_ZIP_ITEMS` (20); dicek dari `Content-Length` dan dihitung ulang saat streaming. |

### Kapan butuh worker terpisah?
Untuk video sangat besar (> beberapa ratus MB), lalu lintas tinggi, atau bila Instagram/TikTok memblokir IP datacenter Vercel. Rancangan alternatif yang kompatibel:
- Jalankan **resolver yang sama** (`api/_lib`, tanpa perubahan) sebagai service kecil (mis. FastAPI/uvicorn di Railway/Fly/Render/VPS) dan proxy media Node di host yang sama, tetap memakai kontrak token yang sama.
- Untuk penyimpanan sementara (mis. jika perlu *muxing* video+audio DASH dengan ffmpeg): tulis ke object storage dengan **TTL pendek** (mis. Vercel Blob/S3 lifecycle 1 jam) dan berikan URL bertanda tangan — jangan menyimpan permanen.

## Keamanan

- Validasi & kanonikalisasi URL (allowlist domain + pola path) di klien **dan** server.
- Pencegahan SSRF: tidak ada URL dari klien yang di-fetch; allowlist host CDN; setiap redirect divalidasi ulang (`redirect: "manual"`); literal IP ditolak; hanya `https`.
- Rate limiting per IP (hash, bukan IP mentah): Upstash Redis bila dikonfigurasi, jika tidak in-memory per instance (*best effort*).
- Timeout di semua panggilan keluar; batas ukuran file; sanitasi nama file (`Content-Disposition` ASCII + RFC 5987).
- Respons media: `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: same-origin`, tolak hotlink lintas situs (`Sec-Fetch-Site`).
- Endpoint POST memeriksa `Origin`. Log tidak menyimpan URL atau IP pengguna.
- Tidak ada password/cookie pengguna yang diminta atau disimpan; tidak ada akses ke konten privat.
