"""Vercel Python Function: POST /api/resolve  {"url": "<post url>"}

Returns the ResolveResponse JSON described in lib/types.ts.
"""

from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _lib.errors import ResolveError  # noqa: E402
from _lib.service import resolve  # noqa: E402

MAX_BODY = 4096


def client_ip(headers) -> str:
    # On Vercel the platform sets these; the left-most x-forwarded-for entry is the client.
    for name in ("x-real-ip", "x-forwarded-for", "x-vercel-forwarded-for"):
        value = headers.get(name)
        if value:
            return value.split(",")[0].strip()[:64]
    return "unknown"


def origin_allowed(headers) -> bool:
    """Browsers always send Origin on cross-site POSTs; only accept our own origin."""
    origin = headers.get("origin")
    if not origin:
        return True
    host = (headers.get("x-forwarded-host") or headers.get("host") or "").split(",")[0].strip().lower()
    extra = {h.strip().lower() for h in os.environ.get("ALLOWED_ORIGINS", "").split(",") if h.strip()}
    try:
        origin_host = (urlsplit(origin).netloc or "").lower()
    except ValueError:
        return False
    return origin_host == host or origin_host in extra


class handler(BaseHTTPRequestHandler):  # noqa: N801 — name required by Vercel
    server_version = "SocialSaver"
    sys_version = ""

    def _send(self, status: int, body: dict, extra: dict | None = None) -> None:
        payload = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(payload)

    def _error(self, code: str, message: str, extra: dict | None = None) -> None:
        err = ResolveError(code, message)
        self._send(err.status, err.to_body(), extra)

    def do_POST(self) -> None:  # noqa: N802
        if not origin_allowed(self.headers):
            self._send(403, {"ok": False, "error": {"code": "INVALID_URL", "message": "Cross-origin requests are not allowed."}})
            return
        ctype = (self.headers.get("content-type") or "").split(";")[0].strip().lower()
        if ctype != "application/json":
            self._error("INVALID_URL", "Send the link as JSON: {\"url\": \"…\"}.")
            return
        try:
            length = int(self.headers.get("content-length") or 0)
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY:
            self._error("INVALID_URL", "Request body is missing or too large.")
            return
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error("INVALID_URL", "Request body is not valid JSON.")
            return
        url = data.get("url") if isinstance(data, dict) else None
        status, body, headers = resolve(url, client_ip(self.headers))
        self._send(status, body, headers)

    def do_GET(self) -> None:  # noqa: N802
        self._send(405, {"ok": False, "error": {"code": "INVALID_URL", "message": "Use POST."}}, {"Allow": "POST"})

    do_PUT = do_DELETE = do_PATCH = do_GET

    def log_message(self, format: str, *args) -> None:  # silence default stderr access log (contains URLs/IPs)
        return
