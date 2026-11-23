# Pengujian

## Otomatis

```bash
npm run test       # Vitest: unit + integrasi route (fetch di-mock) + komponen
npm run test:py    # pytest: validasi URL, token, normalizer Instagram, service, handler HTTP
npm run check      # lint + typecheck + semua test + production build
```

Yang dicakup antara lain: validasi URL (termasuk input berbahaya), token HMAC lintas bahasa (vektor di `shared/token-vector.json` dibuat Python, diverifikasi TypeScript), allowlist CDN, redirect ke host terlarang, batas ukuran, Range, rate limit, ZIP (dibuka ulang dan diperiksa isinya), parsing TikTok (memastikan `downloadAddr` ber-watermark tidak pernah dipakai), dan render UI tanpa tombol palsu.

## Uji nyata (lokal, 23 Nov 2026)

Dijalankan dari mesin developer (IP residensial) terhadap postingan publik. **Belum diverifikasi dari IP Vercel** — lakukan setelah deploy preview (lihat bawah).

| Kasus | Hasil |
|---|---|
| Reel Instagram | ✅ MP4 asli; hasil proxy identik byte-per-byte (MD5) dengan unduhan langsung dari CDN |
| Video Instagram | ✅ |
| Foto tunggal Instagram | ✅ JPG ukuran penuh 1080×1350 |
| Carousel Instagram (3 video) | ✅ |
| Carousel Instagram (5 foto) + ZIP | ✅ ZIP berisi 5 JPG 1080×1080 |
| Konversi PNG di browser | ✅ PNG valid 1080×1350 |
| Video TikTok | ✅ MP4 H.264 576×1024 + audio AAC, tanpa overlay watermark TikTok (dibandingkan frame-per-frame dengan versi `downloadAddr`) |
| Slideshow foto TikTok | ✅ 6 foto ukuran asli (mis. 1082×1134, ± 2,3 MB/foto) + ZIP 6 file; diperiksa visual: tanpa logo/username TikTok. Catatan: halaman `/photo/<id>` tidak memuat data, jadi dibaca lewat `/video/<id>` |
| Pin video Pinterest (`id.pinterest.com`) | ✅ MP4 640×1138 / 1080×1920 + audio AAC; versi asli tanpa tier bitrate dipilih (4,2 MB vs tier 1,4–3,0 MB) |
| Pin gambar Pinterest | ✅ file `originals` (mis. 600×1400, 533×800); crop 600×315 tidak pernah dipilih |
| Pin Pinterest yang menyematkan Vimeo | ✅ ditolak dengan pesan jelas (tidak mengikuti ke situs lain) |
| Range request (seek video) | ✅ 206 Partial Content |
| Token dimodifikasi / hotlink lintas situs / Origin asing | ✅ ditolak (400 / 403 / 403) |

Catatan: header `Content-Length` saat ini tidak diteruskan oleh server Next.js lokal untuk respons streaming (unduhan tetap utuh; browser hanya tidak menampilkan persentase). Periksa ulang di Vercel.

## Uji setelah deploy preview Vercel

```bash
BASE_URL=https://<preview>.vercel.app npm run test:live -- \
  https://www.instagram.com/reel/<kode>/ \
  https://www.tiktok.com/@<user>/video/<id>
```

Skrip ini melaporkan hasil apa adanya (tidak ada mock). Perbarui `lib/support.ts` hanya berdasarkan hasil nyata.
