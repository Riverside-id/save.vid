"""Per-client rate limiting.

Uses Upstash Redis (REST) when configured so limits are shared across function
instances; otherwise falls back to an in-memory sliding window per instance
(best effort — documented as such). Client IPs are hashed, never stored raw.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
import urllib.request
from collections import deque

_lock = threading.Lock()
_hits: dict[str, deque] = {}
_MAX_KEYS = 10_000


def client_key(ip: str, secret: bytes, scope: str) -> str:
    digest = hashlib.sha256(secret + b"|" + ip.encode("utf-8", "ignore")).hexdigest()[:20]
    return f"rl:{scope}:{digest}"


def _memory_check(key: str, limit: int, window: float, now: float) -> int | None:
    with _lock:
        if len(_hits) > _MAX_KEYS:
            _hits.clear()
        q = _hits.setdefault(key, deque())
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return max(1, int(q[0] + window - now) + 1)
        q.append(now)
        return None


def _upstash_check(url: str, token: str, key: str, limit: int, window: int, now: float) -> int | None:
    bucket = int(now // window)
    redis_key = f"{key}:{bucket}"
    req = urllib.request.Request(
        f"{url}/pipeline",
        data=json.dumps([["INCR", redis_key], ["EXPIRE", redis_key, str(window * 2)]]).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=2) as resp:
        count = int(json.loads(resp.read())[0]["result"])
    if count > limit:
        return max(1, int((bucket + 1) * window - now) + 1)
    return None


def check_rate_limit(
    key: str, limit: int, *, window: int = 60, upstash_url: str = "", upstash_token: str = "", now: float | None = None
) -> int | None:
    """Returns None when allowed, otherwise the number of seconds to wait."""
    t = time.time() if now is None else now
    if upstash_url and upstash_token:
        try:
            return _upstash_check(upstash_url, upstash_token, key, limit, window, t)
        except Exception:  # noqa: BLE001 — degrade to local limiter, never fail open entirely
            pass
    return _memory_check(key, limit, float(window), t)


def reset_memory_limiter() -> None:
    with _lock:
        _hits.clear()
