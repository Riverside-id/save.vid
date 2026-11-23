"""Pinterest adapter: yt-dlp info dict → Social Saver API response.

* Video pins: the single best progressive MP4 (video + audio, verified). HLS
  playlists are skipped. Among equal resolutions the untiered original wins
  (Pinterest also serves smaller "_t1.._t4" bitrate tiers of the same video).
* Image pins: the `originals` file — the full-size upload, never a resized or
  cropped variant (Pinterest also lists a cropped 600x315 thumbnail).
* Video pins that Pinterest only lists as HLS streams: the matching progressive
  MP4 is looked up on Pinterest's CDN (same hash path, `/videos/mc/720p/…mp4`)
  and offered ONLY after a probe confirms it exists and is video/mp4.
* Pins that embed a video from another site are rejected upstream (yt-dlp is
  restricted to the Pinterest extractor).
"""

from __future__ import annotations

import re
import urllib.error
import urllib.request
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


_HLS_PATH_RE = re.compile(
    r"^https://v1\.pinimg\.com/videos/(?:iht|mc)/hls/([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{32})(?:_\d+w)?\.m3u8$",
    re.I,
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_PROBE_OPENER = urllib.request.build_opener(_NoRedirect)


def is_video_pin(info: dict) -> bool:
    return any("m3u8" in str(f.get("protocol") or "") or str(f.get("url") or "").split("?")[0].endswith(".mp4") for f in info.get("formats") or [])


def derived_mp4_candidates(info: dict) -> list[str]:
    """Progressive MP4 URLs that share the hash path of the pin's HLS playlists."""
    out: list[str] = []
    for f in info.get("formats") or []:
        for u in (f.get("manifest_url"), f.get("url")):
            m = _HLS_PATH_RE.match(str(u or "").split("?")[0])
            if not m:
                continue
            a, b, c, h = (g.lower() for g in m.groups())
            for folder in ("mc", "iht"):
                cand = f"https://v1.pinimg.com/videos/{folder}/720p/{a}/{b}/{c}/{h}.mp4"
                if cand not in out:
                    out.append(cand)
    return out


def probe_mp4(url: str, timeout: float = 5.0, opener=None) -> bool:
    """True only if the CDN answers 200/206 with video/mp4 (reads at most 1 KB)."""
    if not is_allowed_media_url(url):
        return False
    req = urllib.request.Request(url, headers={"User-Agent": "SocialSaver/0.1 (+media probe)", "Range": "bytes=0-1023", "Referer": REFERER})
    try:
        with (opener or _PROBE_OPENER).open(req, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            resp.read(1024)
            return resp.status in (200, 206) and ctype == "video/mp4"
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def find_video(info: dict, probe=probe_mp4) -> dict | None:
    """Listed progressive MP4 first; otherwise a verified MP4 behind the HLS playlists."""
    listed = best_video(info)
    if listed:
        return listed
    for cand in derived_mp4_candidates(info):
        if probe(cand):
            return {"url": cand, "width": None, "height": None, "derived": True}
    return None


def normalize(
    info: dict, parsed: ParsedUrl, *, secret: bytes, ttl: int, extractor_version: str | None, probe=probe_mp4
) -> dict:
    pin_id = parsed.media_id
    uploader = info.get("uploader") if isinstance(info.get("uploader"), str) else None

    def token(url: str, filename: str, mime: str) -> str:
        return sign_token(secret, url=url, referer=REFERER, filename=filename, mime=mime, ttl=ttl)

    image = best_image(info)
    video = find_video(info, probe)
    notice = None
    if not video and is_video_pin(info):
        notice = (
            "This pin is a video, but Pinterest only streams it and we couldn't find a downloadable MP4 file for it. "
            "You can still save the cover image."
        )
    item: dict
    if video:
        w, h = _int(video.get("width")), _int(video.get("height"))
        fname = build_filename("socialsaver", "pinterest", pin_id, ext="mp4")
        item = {
            "index": 0,
            "kind": "video",
            "width": w or (image["width"] if image else None),
            "height": h or (image["height"] if image else None),
            "durationSeconds": info.get("duration") if isinstance(info.get("duration"), (int, float)) else None,
            "previewToken": token(image["url"], "preview.jpg", _image_type(image["url"])[1]) if image else None,
            "variants": [
                {
                    "id": "mp4-best",
                    "label": f"MP4 · {w}×{h}" if w and h else "MP4 · Full video",
                    "ext": "mp4",
                    "mime": "video/mp4",
                    "width": w,
                    "height": h,
                    "hasAudio": None,
                    "note": "Full video file with sound from Pinterest's CDN (checked before offering) — no watermark added."
                    if video.get("derived")
                    else "Best-quality file Pinterest serves for this pin — no watermark added.",
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
                    "note": "Cover image of the video pin." if notice else "Original upload at full size, exactly as Pinterest stores it.",
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
        "notice": notice,
        "items": [item],
        "extractor": {"name": "yt-dlp", "version": extractor_version},
    }
