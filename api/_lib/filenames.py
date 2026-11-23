"""Filename sanitization (re-done by the Node proxy as defense in depth)."""

from __future__ import annotations

import re
import unicodedata

_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_part(value: object, max_len: int = 40) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode("ascii")
    text = _SAFE.sub("-", text).strip("-._")
    return text[:max_len] or "x"


def build_filename(*parts: object, ext: str) -> str:
    stem = "_".join(safe_part(p) for p in parts if p not in (None, ""))
    ext = safe_part(ext, 5).lower()
    return f"{stem[:150]}.{ext}"
