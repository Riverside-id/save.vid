"""Tiny in-memory TTL cache for resolved posts (per function instance).

Reduces repeated requests to the platforms for the same post. Holds only the
already-normalized public response for a few minutes; nothing is persisted.
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict


class TTLCache:
    def __init__(self, max_items: int = 256, ttl: float = 300.0):
        self.max_items = max_items
        self.ttl = ttl
        self._data: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str, now: float | None = None) -> dict | None:
        t = time.time() if now is None else now
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, value = item
            if expires <= t:
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: dict, now: float | None = None) -> None:
        t = time.time() if now is None else now
        with self._lock:
            self._data[key] = (t + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.max_items:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()
