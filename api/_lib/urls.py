"""Authoritative URL validation & normalization (mirrored client-side in lib/url.ts).

Only canonical URLs rebuilt from validated parts are ever passed on. Query
strings, fragments, credentials and unusual ports are dropped or rejected,
so arbitrary user input never reaches yt-dlp or an HTTP client.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from .errors import ResolveError

MAX_URL_LENGTH = 2048

INSTAGRAM_HOSTS = frozenset({"instagram.com", "www.instagram.com", "m.instagram.com", "instagr.am", "www.instagr.am"})
TIKTOK_HOSTS = frozenset({"tiktok.com", "www.tiktok.com", "m.tiktok.com"})
TIKTOK_SHORT_HOSTS = frozenset({"vm.tiktok.com", "vt.tiktok.com"})

_IG_POST_RE = re.compile(r"^/(?:[A-Za-z0-9._]{1,30}/)?(p|reel|reels|tv)/([A-Za-z0-9_-]{5,64})/?$")
_TT_ITEM_RE = re.compile(r"^/@([A-Za-z0-9._-]{1,64})/(video|photo)/(\d{6,25})/?$")
_TT_T_RE = re.compile(r"^/t/([A-Za-z0-9]{5,20})/?$")
_TT_SHORT_RE = re.compile(r"^/([A-Za-z0-9]{5,20})/?$")
_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:", re.I)


@dataclass(frozen=True)
class ParsedUrl:
    platform: str  # "instagram" | "tiktok"
    kind: str  # "post" | "short-link"
    canonical: str
    media_id: str  # IG shortcode, TikTok item id, or short-link code
    path_type: str  # IG: p/reel/tv, TikTok: video/photo/short


def parse_url(raw: object) -> ParsedUrl:
    if not isinstance(raw, str) or not raw.strip():
        raise ResolveError("INVALID_URL", "Paste a link to an Instagram or TikTok post.")
    text = raw.strip()
    if len(text) > MAX_URL_LENGTH:
        raise ResolveError("INVALID_URL", "That link is too long.")
    if any(ord(c) < 0x20 or c in " \\" for c in text):
        raise ResolveError("INVALID_URL", "That doesn't look like a valid web link.")
    if not _SCHEME_RE.match(text):
        text = "https://" + text

    try:
        parts = urlsplit(text)
        port = parts.port  # raises ValueError for garbage ports
    except ValueError:
        raise ResolveError("INVALID_URL", "That doesn't look like a valid web link.") from None

    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        raise ResolveError("INVALID_URL", "That doesn't look like a valid web link.")
    if parts.username or parts.password or (port is not None and port not in (80, 443)):
        raise ResolveError("INVALID_URL", "Links with credentials or custom ports are not allowed.")

    host = parts.hostname.lower().rstrip(".")
    path = re.sub(r"/{2,}", "/", parts.path or "/")

    if host in INSTAGRAM_HOSTS:
        m = _IG_POST_RE.match(path)
        if not m:
            raise ResolveError(
                "UNSUPPORTED_URL",
                "Use a link to a single Instagram post, reel or video. Profiles and stories are not supported.",
            )
        kind = "reel" if m.group(1) == "reels" else m.group(1)
        code = m.group(2)
        return ParsedUrl("instagram", "post", f"https://www.instagram.com/{kind}/{code}/", code, kind)

    if host in TIKTOK_HOSTS:
        m = _TT_ITEM_RE.match(path)
        if m:
            user, typ, item_id = m.groups()
            return ParsedUrl("tiktok", "post", f"https://www.tiktok.com/@{user}/{typ}/{item_id}", item_id, typ)
        s = _TT_T_RE.match(path)
        if s:
            return ParsedUrl("tiktok", "short-link", f"https://www.tiktok.com/t/{s.group(1)}/", s.group(1), "short")
        raise ResolveError("UNSUPPORTED_URL", "Use a link to a single TikTok video or photo post.")

    if host in TIKTOK_SHORT_HOSTS:
        s = _TT_SHORT_RE.match(path)
        if s:
            return ParsedUrl("tiktok", "short-link", f"https://{host}/{s.group(1)}/", s.group(1), "short")
        raise ResolveError("UNSUPPORTED_URL", "That TikTok short link looks incomplete.")

    raise ResolveError("UNSUPPORTED_URL", "Only instagram.com and tiktok.com links are supported.")


# ── Media CDN allowlist (also enforced by the Node proxy) ─────────────────
_MEDIA_HOST_SUFFIXES = (
    ".cdninstagram.com",
    ".fbcdn.net",
    ".tiktokcdn.com",
    ".tiktokcdn-us.com",
    ".tiktokcdn-eu.com",
)


def is_allowed_media_url(url: object) -> bool:
    if not isinstance(url, str) or len(url) > 4096:
        return False
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or port not in (None, 443):
        return False
    return any(host.endswith(sfx) and len(host) > len(sfx) for sfx in _MEDIA_HOST_SUFFIXES)
