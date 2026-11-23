import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

import resolve as handler_module
from _lib import service
from _lib.errors import ResolveError
from _lib.ratelimit import check_rate_limit, reset_memory_limiter
from _lib.ytdlp_runner import map_ytdlp_error
from fixtures import video_entry


@pytest.fixture(autouse=True)
def _reset():
    reset_memory_limiter()
    service.clear_cache()
    yield


@pytest.mark.parametrize(
    "message,code",
    [
        ("ERROR: [Instagram] x: Requested content is not available, rate-limit reached or login required", "UPSTREAM_BLOCKED"),
        ("ERROR: [Instagram] x: Restricted Video: You must be 18 years old", "LOGIN_REQUIRED"),
        ("This content is only available for registered users who follow this account", "LOGIN_REQUIRED"),
        ("Instagram sent an empty media response. Check if this post is accessible", "NOT_FOUND"),
        ("Unable to download webpage: HTTP Error 404: Not Found", "NOT_FOUND"),
        ("Unable to download webpage: The read operation timed out", "TIMEOUT"),
        ("Unable to download webpage: <urlopen error>", "UPSTREAM_ERROR"),
    ],
)
def test_ytdlp_errors_map_to_honest_codes(message, code):
    assert map_ytdlp_error(message).code == code


def test_rate_limiter_window():
    for _ in range(3):
        assert check_rate_limit("k", 3, now=1000.0) is None
    assert check_rate_limit("k", 3, now=1000.0) >= 1
    assert check_rate_limit("k", 3, now=1061.0) is None


def test_resolve_success_is_cached(monkeypatch):
    calls = []

    def fake_extract(url, extractor, timeout):
        calls.append((url, extractor))
        return video_entry()

    monkeypatch.setattr(service, "extract_info", fake_extract)
    status, body, headers = service.resolve("https://www.instagram.com/reel/ABCDEF12345/?igsh=1", "1.1.1.1")
    assert status == 200 and body["ok"] and headers["X-Cache"] == "MISS"
    assert calls == [("https://www.instagram.com/reel/ABCDEF12345/", "Instagram")]  # canonical URL only
    status, _, headers = service.resolve("https://instagram.com/reel/ABCDEF12345", "1.1.1.1")
    assert status == 200 and headers["X-Cache"] == "HIT" and len(calls) == 1


def test_resolve_rejects_tiktok_and_maps_errors(monkeypatch):
    status, body, _ = service.resolve("https://www.tiktok.com/@a/video/7047596209028074758", "2.2.2.2")
    assert status == 422 and body["error"]["code"] == "UNSUPPORTED_URL"

    def boom(*a, **k):
        raise ResolveError("LOGIN_REQUIRED", "private")

    monkeypatch.setattr(service, "extract_info", boom)
    status, body, _ = service.resolve("https://www.instagram.com/p/ABCDEF12345/", "2.2.2.2")
    assert status == 403 and body == {"ok": False, "error": {"code": "LOGIN_REQUIRED", "message": "private"}}


def test_resolve_rate_limits(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_RESOLVE_PER_MIN", "2")
    for _ in range(2):
        service.resolve("https://evil.example/", "3.3.3.3")
    status, body, headers = service.resolve("https://evil.example/", "3.3.3.3")
    assert status == 429 and "Retry-After" in headers and body["error"]["code"] == "RATE_LIMITED"


def test_missing_secret_is_reported(monkeypatch):
    monkeypatch.setenv("MEDIA_TOKEN_SECRET", "short")
    status, body, _ = service.resolve("https://www.instagram.com/p/ABCDEF12345/", "4.4.4.4")
    assert status == 500 and body["error"]["code"] == "MISCONFIGURED"


@pytest.fixture()
def server(monkeypatch):
    monkeypatch.setattr(handler_module, "resolve", lambda url, ip: (200, {"ok": True, "echo": url, "ip": ip}, {}))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler_module.handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def call(base, body=b'{"url":"x"}', headers=None, method="POST"):
    req = urllib.request.Request(base + "/api/resolve", data=body if method == "POST" else None, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read()), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read()), dict(e.headers)


def test_handler_happy_path_and_headers(server):
    status, body, headers = call(server, headers={"X-Forwarded-For": "5.6.7.8, 10.0.0.1"})
    assert status == 200 and body == {"ok": True, "echo": "x", "ip": "5.6.7.8"}
    assert headers["Cache-Control"] == "no-store" and headers["X-Content-Type-Options"] == "nosniff"


def test_handler_rejects_bad_requests(server):
    assert call(server, headers={"Origin": "https://evil.example"})[0] == 403
    assert call(server, headers={"Content-Type": "text/plain"})[0] == 400
    assert call(server, body=b"{not json")[0] == 400
    assert call(server, body=b'{"url":"' + b"a" * 5000 + b'"}')[0] == 400
    assert call(server, method="GET")[0] == 405
