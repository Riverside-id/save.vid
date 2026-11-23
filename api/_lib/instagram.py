"""Instagram adapter: yt-dlp info dict → Social Saver API response.

Only what really exists is exposed:
* progressive MP4 files (video + audio when the source has audio) — preferred
* video-only DASH renditions are offered ONLY when the post has no audio track
  at all (then nothing is lost); otherwise they would silently drop the sound
* photos: the full-size original only (no resizing, no smaller copies)
Every media URL must be on the CDN allowlist, and is wrapped in a signed token.
"""

from __future__ import annotations

from urllib.parse import urlsplit

from .errors import ResolveError
from .filenames import build_filename
from .tokens import sign_token
from .urls import ParsedUrl, is_allowed_media_url

REFERER = "https://www.instagram.com/"
_IMAGE_EXT = {".jpg": ("jpg", "image/jpeg"), ".jpeg": ("jpg", "image/jpeg"), ".webp": ("webp", "image/webp")}
MAX_CAPTION = 600


def _int(v: object) -> int | None:
    try:
        n = int(v)  # type: ignore[arg-type]
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _image_type(url: str) -> tuple[str, str] | None:
    path = urlsplit(url).path.lower()
    for suffix, value in _IMAGE_EXT.items():
        if path.endswith(suffix):
            return value
    return None


def _images(entry: dict) -> list[dict]:
    """Unique, allowlisted image candidates, largest first.

    Logged-out responses sometimes omit width/height. yt-dlp lists candidates
    from smallest to largest, so without dimensions the LAST one is the
    full-size original; we keep that order (reversed) and never guess sizes.
    """
    seen: set[str] = set()
    sized: list[dict] = []
    unsized: list[dict] = []
    for t in entry.get("thumbnails") or []:
        url, w, h = t.get("url"), _int(t.get("width")), _int(t.get("height"))
        if not (is_allowed_media_url(url) and _image_type(url)) or url in seen:
            continue
        seen.add(url)
        (sized if w and h else unsized).append({"url": url, "width": w if h else None, "height": h if w else None})
    if sized:
        sized.sort(key=lambda c: c["width"] * c["height"], reverse=True)
        return sized
    return list(reversed(unsized))


def _progressive(entry: dict) -> list[dict]:
    seen: set[str] = set()
    out = []
    for f in entry.get("formats") or []:
        fid, url = str(f.get("format_id") or ""), f.get("url")
        if fid.startswith("dash-") or f.get("protocol") not in ("https", "http", None):
            continue
        if f.get("vcodec") == "none" or not is_allowed_media_url(url) or url in seen:
            continue
        seen.add(url)
        out.append(f)
    return out


def _dash_video(entry: dict) -> list[dict]:
    best: dict[tuple[int, int], dict] = {}
    for f in entry.get("formats") or []:
        if not str(f.get("format_id") or "").startswith("dash-"):
            continue
        w, h = _int(f.get("width")), _int(f.get("height"))
        if not (w and h) or f.get("vcodec") in (None, "none") or f.get("acodec") not in ("none",):
            continue
        if not is_allowed_media_url(f.get("url")):
            continue
        prev = best.get((w, h))
        if prev is None or (f.get("tbr") or 0) > (prev.get("tbr") or 0):
            best[(w, h)] = f
    return sorted(best.values(), key=lambda f: _int(f.get("height")) or 0, reverse=True)


def _has_audio(progressive: list[dict]) -> bool | None:
    if not progressive:
        return None
    codecs = [f.get("acodec") for f in progressive]
    if all(c == "none" for c in codecs):
        return False
    if any(c not in (None, "none") for c in codecs):
        return True
    return None


def _pick_preview(images: list[dict]) -> dict | None:
    if not images:
        return None
    if images[0]["width"] is None:
        return images[0]  # sizes unknown → the full-size image is the only safe choice
    return min(images, key=lambda c: abs(c["width"] - 720))


def normalize(info: dict, parsed: ParsedUrl, *, secret: bytes, ttl: int, extractor_version: str | None) -> dict:
    is_carousel = info.get("_type") == "playlist"
    entries = [e for e in (info.get("entries") or []) if isinstance(e, dict)] if is_carousel else [info]
    username = info.get("channel") or (entries[0].get("channel") if entries else None)
    display_name = info.get("uploader") or (entries[0].get("uploader") if entries else None)
    code = parsed.media_id
    multi = len(entries) > 1

    def token(url: str, filename: str, mime: str) -> str:
        return sign_token(secret, url=url, referer=REFERER, filename=filename, mime=mime, ttl=ttl)

    items: list[dict] = []
    for idx, entry in enumerate(entries):
        images = _images(entry)
        progressive = _progressive(entry)
        dash = _dash_video(entry)
        is_video = bool(progressive or dash)
        preview = _pick_preview(images)
        n = idx + 1 if multi else None
        variants: list[dict] = []

        if is_video:
            has_audio = _has_audio(progressive)
            for i, f in enumerate(progressive):
                w, h = _int(f.get("width")), _int(f.get("height"))
                fname = build_filename("socialsaver", "ig", username, code, n, f"v{i + 1}" if i else None, ext="mp4")
                variants.append(
                    {
                        "id": f"mp4-orig-{i}",
                        "label": f"MP4 · {w}×{h}" if w and h else ("MP4 · Standard" if i == 0 else f"MP4 · Standard {i + 1}"),
                        "ext": "mp4",
                        "mime": "video/mp4",
                        "width": w,
                        "height": h,
                        "hasAudio": has_audio,
                        "note": "This post has no audio track." if has_audio is False else "Single file with video and audio.",
                        "filename": fname,
                        "token": token(f["url"], fname, "video/mp4"),
                    }
                )
            if has_audio is False or not progressive:
                for f in dash:
                    w, h = _int(f.get("width")), _int(f.get("height"))
                    fname = build_filename("socialsaver", "ig", username, code, n, f"{h}p", ext="mp4")
                    variants.append(
                        {
                            "id": f"mp4-{w}x{h}",
                            "label": f"MP4 · {w}×{h}",
                            "ext": "mp4",
                            "mime": "video/mp4",
                            "width": w,
                            "height": h,
                            "hasAudio": False,
                            "note": "Video-only rendition. The source has no audio track, so nothing is lost."
                            if has_audio is False
                            else "Video-only rendition (no audio track).",
                            "filename": fname,
                            "token": token(f["url"], fname, "video/mp4"),
                        }
                    )
        elif images:
            # Photos: always the full-size original — no resizing, no smaller copies.
            best = images[0]
            ext, mime = _image_type(best["url"]) or ("jpg", "image/jpeg")
            fname = build_filename("socialsaver", "ig", username, code, n, ext=ext)
            w, h = best["width"], best["height"]
            variants.append(
                {
                    "id": f"{ext}-full",
                    "label": f"{ext.upper()} · {w}×{h}" if w and h else f"{ext.upper()} · Full size",
                    "ext": ext,
                    "mime": mime,
                    "width": w,
                    "height": h,
                    "hasAudio": None,
                    "note": "Full-size photo, exactly as Instagram serves it.",
                    "filename": fname,
                    "token": token(best["url"], fname, mime),
                }
            )

        if not variants and not preview:
            continue
        best_img = images[0] if images else None
        items.append(
            {
                "index": len(items),
                "kind": "video" if is_video else "image",
                "width": (variants[0]["width"] if variants and variants[0]["width"] else None)
                or (best_img["width"] if best_img else None),
                "height": (variants[0]["height"] if variants and variants[0]["height"] else None)
                or (best_img["height"] if best_img else None),
                "durationSeconds": entry.get("duration") if isinstance(entry.get("duration"), (int, float)) else None,
                "previewToken": token(preview["url"], "preview.jpg", _image_type(preview["url"])[1]) if preview else None,
                "variants": variants,
            }
        )

    if not items or not any(i["variants"] for i in items):
        raise ResolveError("NO_MEDIA", "We couldn't find any downloadable photo or video in this post.")

    if is_carousel:
        post_type = "carousel"
    else:
        post_type = items[0]["kind"]

    caption = info.get("description")
    if isinstance(caption, str):
        caption = caption.strip()[:MAX_CAPTION] or None
    else:
        caption = None

    skipped = len(entries) - len(items)
    notice = (
        f"{skipped} item(s) in this post could not be processed and were left out." if skipped > 0 else None
    )

    return {
        "ok": True,
        "platform": "instagram",
        "sourceUrl": parsed.canonical,
        "postType": post_type,
        "author": {"username": username, "displayName": display_name},
        "caption": caption,
        "downloadable": True,
        "notice": notice,
        "items": items,
        "extractor": {"name": "yt-dlp", "version": extractor_version},
    }
