"""Local stand-in for Vercel's Python runtime: serves api/resolve.py on 127.0.0.1:8000.

Next.js (`npm run dev`) rewrites /api/resolve here. Not used in production.
"""

from __future__ import annotations

import os
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def main() -> None:
    load_env_file(ROOT / ".env.local")
    load_env_file(ROOT / ".env")
    sys.path.insert(0, str(ROOT / "api"))
    import resolve  # noqa: PLC0415  (api/resolve.py)

    class DevHandler(resolve.handler):
        def _route_ok(self) -> bool:
            if self.path.split("?")[0].rstrip("/") == "/api/resolve":
                return True
            self._send(404, {"ok": False, "error": {"code": "MISCONFIGURED", "message": "Not found"}})
            return False

        def do_POST(self) -> None:  # noqa: N802
            if self._route_ok():
                super().do_POST()

        def do_GET(self) -> None:  # noqa: N802
            if self._route_ok():
                super().do_GET()

    port = int(os.environ.get("PY_DEV_PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), DevHandler)
    print(f"[py] resolver listening on http://127.0.0.1:{port}/api/resolve", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
