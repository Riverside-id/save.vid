"""Pinterest adapter: yt-dlp info dict → Social Saver API response.

* Video pins: the single best progressive MP4 (video + audio, verified). HLS
  playlists are skipped. Among equal resolutions the untiered original wins
  (Pinterest also serves smaller "_t1.._t4" bitrate tiers of the same video).
* Image pins: the `originals` file — the full-size upload, never a resized or
  cropped variant (Pinterest also lists a cropped 600x315 thumbnail).
* Pins that embed a video from another site are rejected upstream (yt-dlp is
  restricted to the Pinterest extractor).
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from .errors import ResolveError
from .filenames import build_filename
from .tokens import sign_token
from .urls import ParsedUrl, is_allowed_media_url

REFERER = "https://www.pinterest.com/"
_IMAGE_TYPES = {
    ".jpg": ("jpg", "image/jpeg"),
    ".jpeg": ("jpg", "image/jpeg"),
    ".png": ("png", "image/png"),
    ".gif": ("gif", "image/gif"),
    ".webp": ("webp", "image/webp"),
}
_TIER_RE = re.compile(r"_t\d+\.mp4$", re.I)
MAX_CAPTION = 600


def _int(v: object) -> int | None:
    try:
        n = int(v)  # type: ignore[arg-type]
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _image_type(url: str) -> tuple[str, str] | None:
    path = urlsplit(url).path.lower()
    for suffix, value in _IMAGE_TYPES.items():
        if path.endswith(suffix):
            return value
    return None


def best_image(info: dict) -> dict | None:
    """The `originals` candidate when present, else the largest uncropped one."""
    cands = []
    for t in info.get("thumbnails") or []:
        url = t.get("url")
        if not (is_allowed_media_url(url) and _image_type(url)):
            continue
        path = urlsplit(url).path
        if re.match(r"^/\d+x\d+/", path):  # fixed-box crops such as /600x315/ or /60x60/
            continue
        cands.append({"url": url, "width": _int(t.get("width")), "height": _int(t.get("height")), "orig": path.startswith("/originals/")})
    if not cands:
        return None
    return max(cands, key=lambda c: (c["orig"], (c["width"] or 0) * (c["height"] or 0)))


def best_video(info: dict) -> dict | None:
    cands = [
        f
        for f in info.get("formats") or []
        if f.get("protocol") in ("https", "http", None)
        and not str(f.get("format_id") or "").upper().startswith("V_HLS")
        and str(f.get("url") or "").split("?")[0].lower().endswith(".mp4")
        and is_allowed_media_url(f.get("url"))
    ]
    if not cands:
        return None
    return max(cands, key=lambda f: (_int(f.get("height")) or 0, not _TIER_RE.search(f["url"].split("?")[0])))


def normalize(info: dict, parsed: ParsedUrl, *, secret: bytes, ttl: int, extractor_version: str | None) -> dict:
    pin_id = parsed.media_id
    uploader = info.get("uploader") if isinstance(info.get("uploader"), str) else None

    def token(url: str, filename: str, mime: str) -> str:
        return sign_token(secret, url=url, referer=REFERER, filename=filename, mime=mime, ttl=ttl)

    image = best_image(info)
    video = best_video(info)
    item: dict
    if video:
        w, h = _int(video.get("width")), _int(video.get("height"))
        fname = build_filename("socialsaver", "pinterest", pin_id, ext="mp4")
        item = {
            "index": 0,
            "kind": "video",
            "width": w,
            "height": h,
            "durationSeconds": info.get("duration") if isinstance(info.get("duration"), (int, float)) else None,
            "previewToken": token(image["url"], "preview.jpg", _image_type(image["url"])[1]) if image else None,
            "variants": [
                {
                    "id": "mp4-best",
                    "label": f"MP4 · {w}×{h}" if w and h else "MP4 · Original",
                    "ext": "mp4",
                    "mime": "video/mp4",
                    "width": w,
                    "height": h,
                    "hasAudio": None,
                    "note": "Best-quality file Pinterest serves for this pin — no watermark added.",
                    "filename": fname,
                    "token": token(video["url"], fname, "video/mp4"),
                }
            ],
        }
    elif image:
        ext, mime = _image_type(image["url"]) or ("jpg", "image/jpeg")
        w, h = image["width"], image["height"]
        fname = build_filename("socialsaver", "pinterest", pin_id, ext=ext)
        item = {
            "index": 0,
            "kind": "image",
            "width": w,
            "height": h,
            "durationSeconds": None,
            "previewToken": token(image["url"], f"preview.{ext}", mime),
            "variants": [
                {
                    "id": f"{ext}-original",
                    "label": f"{ext.upper()} · {w}×{h}" if w and h else f"{ext.upper()} · Original",
                    "ext": ext,
                    "mime": mime,
                    "width": w,
                    "height": h,
                    "hasAudio": None,
                    "note": "Original upload at full size, exactly as Pinterest stores it.",
                    "filename": fname,
                    "token": token(image["url"], fname, mime),
                }
            ],
        }
    else:
        raise ResolveError("NO_MEDIA", "We couldn't find a downloadable image or video in this pin.")

    caption = info.get("description") or info.get("title")
    if isinstance(caption, str) and not caption.startswith("Pinterest video #"):
        caption = caption.strip()[:MAX_CAPTION] or None
    else:
        caption = None

    return {
        "ok": True,
        "platform": "pinterest",
        "sourceUrl": parsed.canonical,
        "postType": item["kind"],
        "author": {"username": None, "displayName": uploader},
        "caption": caption,
        "downloadable": True,
        "notice": None,
        "items": [item],
        "extractor": {"name": "yt-dlp", "version": extractor_version},
    }
