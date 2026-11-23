"""HMAC-SHA256 signed media tokens.

Format: base64url(json_payload) "." base64url(hmac_sha256(secret, base64url(json_payload)))
Verified by lib/server/token.ts. The payload never contains user data or secrets:
only the public CDN URL, the Referer to send, a filename, a MIME type and an expiry.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign_token(secret: bytes, *, url: str, referer: str | None, filename: str, mime: str, ttl: int, now: float | None = None) -> str:
    payload = {
        "v": 1,
        "u": url,
        "r": referer,
        "f": filename,
        "m": mime,
        "x": int((now if now is not None else time.time()) + ttl),
    }
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8"))
    sig = _b64(hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest())
    return f"{body}.{sig}"
