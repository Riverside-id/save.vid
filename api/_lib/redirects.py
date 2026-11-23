"""SSRF-safe short-link expansion (pin.it).

Redirects are never followed blindly: each hop is read without following,
its target host must be on the allowlist and resolve to public IPs only,
and the final URL must parse as a supported post (checked by the caller).
"""

from __future__ import annotations

import ipaddress
import socket
import urllib.error
import urllib.request
from collections.abc import Callable
from urllib.parse import urljoin, urlsplit

from .errors import ResolveError

USER_AGENT = "SocialSaver/0.1 (+short link expander)"


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def _check_public(host: str) -> None:
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ResolveError("UPSTREAM_ERROR", "Could not reach the platform.") from None
    for info in infos:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ResolveError("UPSTREAM_ERROR", "Refusing to connect to a non-public address.")


def expand(
    url: str,
    *,
    host_allowed: Callable[[str], bool],
    is_final: Callable[[str], bool],
    max_hops: int = 4,
    timeout: float = 6.0,
    opener=None,
    check_ip: bool = True,
) -> str:
    """Follows redirects hop by hop until `is_final(url)` is true; returns that URL."""
    op = opener or _OPENER
    current = url
    for _ in range(max_hops + 1):
        if is_final(current):
            return current
        parts = urlsplit(current)
        host = (parts.hostname or "").lower()
        if parts.scheme not in ("https", "http") or parts.username or parts.password or not host_allowed(host):
            raise ResolveError("UNSUPPORTED_URL", "The short link points somewhere we don't support.")
        if parts.port not in (None, 80, 443):
            raise ResolveError("UNSUPPORTED_URL", "The short link points somewhere we don't support.")
        if check_ip:
            _check_public(host)
        req = urllib.request.Request(current, method="GET", headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
        location = None
        try:
            with op.open(req, timeout=timeout):
                pass  # 2xx without reaching a post URL → dead end
        except urllib.error.HTTPError as err:
            if err.code in (301, 302, 303, 307, 308):
                location = err.headers.get("Location")
        except (TimeoutError, socket.timeout):
            raise ResolveError("TIMEOUT", "The short link took too long to respond.") from None
        except urllib.error.URLError:
            raise ResolveError("UPSTREAM_ERROR", "Could not expand the short link.") from None
        if not location:
            break
        current = urljoin(current, location)
    raise ResolveError("UNSUPPORTED_URL", "We couldn't expand this short link. Please paste the full link instead.")
