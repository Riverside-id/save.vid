"""Typed errors that map 1:1 to the `ErrorCode` union in lib/types.ts."""

from __future__ import annotations

HTTP_STATUS = {
    "INVALID_URL": 400,
    "UNSUPPORTED_URL": 422,
    "RATE_LIMITED": 429,
    "NOT_FOUND": 404,
    "LOGIN_REQUIRED": 403,
    "UPSTREAM_BLOCKED": 503,
    "UPSTREAM_ERROR": 502,
    "TIMEOUT": 504,
    "NO_MEDIA": 422,
    "MISCONFIGURED": 500,
    "INTERNAL": 500,
}


class ResolveError(Exception):
    def __init__(self, code: str, message: str, retry_after: int | None = None):
        if code not in HTTP_STATUS:
            raise ValueError(f"unknown error code {code}")
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after = retry_after

    @property
    def status(self) -> int:
        return HTTP_STATUS[self.code]

    def to_body(self) -> dict:
        err: dict = {"code": self.code, "message": self.message}
        if self.retry_after:
            err["retryAfterSeconds"] = self.retry_after
        return {"ok": False, "error": err}
