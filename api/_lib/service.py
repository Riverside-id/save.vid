"""Orchestrates one resolve request: rate limit → validate → cache → adapter."""

from __future__ import annotations

import logging

from . import instagram
from .cache import TTLCache
from .config import load_config
from .errors import ResolveError
from .ratelimit import check_rate_limit, client_key
from .urls import parse_url
from .ytdlp_runner import YTDLP_VERSION, extract_info

log = logging.getLogger("socialsaver")
_cache = TTLCache(max_items=256, ttl=300)


def _extract_instagram(parsed, cfg) -> dict:
    info = extract_info(parsed.canonical, "Instagram", cfg.extract_timeout)
    return instagram.normalize(info, parsed, secret=cfg.token_secret, ttl=cfg.token_ttl, extractor_version=YTDLP_VERSION)


def resolve(raw_url: object, client_ip: str) -> tuple[int, dict, dict]:
    """Returns (status, json_body, extra_headers). Never raises."""
    try:
        cfg = load_config()
        wait = check_rate_limit(
            client_key(client_ip or "unknown", cfg.token_secret, "resolve"),
            cfg.resolve_per_min,
            upstash_url=cfg.upstash_url,
            upstash_token=cfg.upstash_token,
        )
        if wait:
            raise ResolveError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.", retry_after=wait)

        parsed = parse_url(raw_url)
        cache_key = parsed.canonical
        cached = _cache.get(cache_key)
        if cached is not None:
            return 200, cached, {"X-Cache": "HIT"}

        if parsed.platform != "instagram":
            # TikTok is resolved by the Node route /api/tiktok (single-session reads).
            raise ResolveError("UNSUPPORTED_URL", "TikTok links are handled by /api/tiktok.")
        body = _extract_instagram(parsed, cfg)

        _cache.set(cache_key, body)
        log.info("resolve ok platform=%s type=%s items=%d", body["platform"], body["postType"], len(body["items"]))
        return 200, body, {"X-Cache": "MISS"}
    except ResolveError as err:
        headers = {"Retry-After": str(err.retry_after)} if err.retry_after else {}
        log.info("resolve failed code=%s", err.code)
        return err.status, err.to_body(), headers
    except Exception:  # noqa: BLE001
        log.exception("resolve crashed")
        return 500, ResolveError("INTERNAL", "Something went wrong on our side. Please try again.").to_body(), {}


def clear_cache() -> None:
    _cache.clear()
