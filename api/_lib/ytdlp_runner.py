"""Runs yt-dlp as a library for metadata extraction only (never downloads).

Hardening:
* only the given extractor is allowed (`allowed_extractors`) — the generic
  extractor can never be used, so yt-dlp cannot be pointed at arbitrary URLs
* no cookies, no login, no cache directory, no impersonation (curl_cffi is
  not installed), no comment fetching
* hard wall-clock timeout around the whole extraction
"""

from __future__ import annotations

import concurrent.futures
import re

from .errors import ResolveError

try:  # imported lazily-ish so unit tests can run without network
    import yt_dlp
    from yt_dlp.utils import DownloadError, ExtractorError
    from yt_dlp.version import __version__ as YTDLP_VERSION
except ImportError:  # pragma: no cover
    yt_dlp = None
    DownloadError = ExtractorError = Exception  # type: ignore[assignment,misc]
    YTDLP_VERSION = None

_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="ytdlp")


class _QuietLogger:
    def debug(self, msg: str) -> None:
        pass

    def info(self, msg: str) -> None:
        pass

    def warning(self, msg: str) -> None:
        pass

    def error(self, msg: str) -> None:
        pass


def _options(extractor: str) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "skip_download": True,
        "simulate": True,
        "ignore_no_formats_error": True,  # photo posts have no video formats
        "allowed_extractors": [extractor],
        "cachedir": False,
        "socket_timeout": 10,
        "retries": 1,
        "extractor_retries": 1,
        "getcomments": False,
        "writesubtitles": False,
        "check_formats": False,
        "logger": _QuietLogger(),
    }


# Ordered: first match wins. Patterns target yt-dlp's (stable-ish) error texts.
# "{name}" is replaced with the platform name (Instagram, Pinterest, ...).
_ERROR_MAP: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(r"rate-limit|429|Too Many Requests", re.I),
        "UPSTREAM_BLOCKED",
        "{name} is temporarily limiting requests from our server. Please try again in a few minutes.",
    ),
    (
        re.compile(r"Restricted Video|\bage[- ]?(?:restrict|gate|verif)", re.I),
        "LOGIN_REQUIRED",
        "This post is age-restricted or gated by {name}, so it can't be accessed without logging in.",
    ),
    (
        re.compile(r"login|registered users|follow this account|private", re.I),
        "LOGIN_REQUIRED",
        "This post isn't publicly accessible (private account or login required). Social Saver only works with public posts.",
    ),
    (
        re.compile(r"empty media response|HTTP Error 404|not found|does not exist|unavailable", re.I),
        "NOT_FOUND",
        "{name} returned no media for this link. The post may have been deleted, made private, or be temporarily unavailable.",
    ),
    (re.compile(r"timed out|timeout", re.I), "TIMEOUT", "{name} took too long to respond. Please try again."),
    (
        re.compile(r"Unsupported URL|vimeo|youtube", re.I),
        "UNSUPPORTED_URL",
        "This post embeds a video hosted on another site, which Social Saver doesn't support.",
    ),
]

_NAMES = {"Instagram": "Instagram", "Pinterest": "Pinterest"}


def map_ytdlp_error(message: str, extractor: str = "Instagram") -> ResolveError:
    name = _NAMES.get(extractor, "The platform")
    for pattern, code, friendly in _ERROR_MAP:
        if pattern.search(message or ""):
            return ResolveError(code, friendly.format(name=name))
    return ResolveError("UPSTREAM_ERROR", "The platform returned an unexpected response. Please try again later.")


def extract_info(url: str, extractor: str, timeout: float) -> dict:
    if yt_dlp is None:  # pragma: no cover
        raise ResolveError("MISCONFIGURED", "yt-dlp is not installed on the server.")

    def _run() -> dict:
        with yt_dlp.YoutubeDL(_options(extractor)) as ydl:
            info = ydl.extract_info(url, download=False)
            return ydl.sanitize_info(info)

    future = _EXECUTOR.submit(_run)
    try:
        info = future.result(timeout=timeout)
    except concurrent.futures.TimeoutError:
        future.cancel()
        raise ResolveError("TIMEOUT", "The platform took too long to respond. Please try again.") from None
    except (DownloadError, ExtractorError) as err:
        raise map_ytdlp_error(str(err), extractor) from None
    if not isinstance(info, dict):
        raise ResolveError("NO_MEDIA", "No media was found in this post.")
    return info
