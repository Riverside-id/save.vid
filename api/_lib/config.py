"""Environment configuration with safe defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .errors import ResolveError


def _int(name: str, default: int, lo: int, hi: int) -> int:
    raw = os.environ.get(name, "").strip()
    try:
        value = int(raw) if raw else default
    except ValueError:
        value = default
    return max(lo, min(hi, value))


@dataclass(frozen=True)
class Config:
    token_secret: bytes
    token_ttl: int
    resolve_per_min: int
    extract_timeout: float
    upstash_url: str
    upstash_token: str


def load_config() -> Config:
    secret = os.environ.get("MEDIA_TOKEN_SECRET", "").strip()
    if len(secret) < 32:
        raise ResolveError(
            "MISCONFIGURED",
            "Server is missing its MEDIA_TOKEN_SECRET (32+ characters). See README → Environment.",
        )
    return Config(
        token_secret=secret.encode("utf-8"),
        token_ttl=_int("MEDIA_TOKEN_TTL_SECONDS", 3600, 60, 6 * 3600),
        resolve_per_min=_int("RATE_LIMIT_RESOLVE_PER_MIN", 10, 1, 600),
        extract_timeout=float(_int("EXTRACT_TIMEOUT_SECONDS", 22, 5, 55)),
        upstash_url=os.environ.get("UPSTASH_REDIS_REST_URL", "").strip().rstrip("/"),
        upstash_token=os.environ.get("UPSTASH_REDIS_REST_TOKEN", "").strip(),
    )
