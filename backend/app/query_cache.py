import time
from collections import OrderedDict
from threading import Lock
from typing import Dict, Optional

# Maximum number of query results to hold in memory.
_MAX_CACHE_SIZE = 256

# How long a cached result stays valid (seconds).
# Default: 5 minutes. Set to 0 to disable TTL.
_TTL_SECONDS = 300

_CACHE: OrderedDict[str, Dict] = OrderedDict()
_CACHE_LOCK = Lock()


def get_cached_result(cache_key: str) -> Optional[Dict]:
    with _CACHE_LOCK:
        entry = _CACHE.get(cache_key)
        if entry is None:
            return None

        if _TTL_SECONDS > 0 and time.monotonic() - entry["_cached_at"] > _TTL_SECONDS:
            del _CACHE[cache_key]
            return None

        _CACHE.move_to_end(cache_key)
        # return a copy without the internal timestamp key
        return {k: v for k, v in entry.items() if k != "_cached_at"}


def store_cached_result(cache_key: str, result: Dict) -> None:
    with _CACHE_LOCK:
        entry = {**result, "_cached_at": time.monotonic()}
        _CACHE[cache_key] = entry
        _CACHE.move_to_end(cache_key)

        while len(_CACHE) > _MAX_CACHE_SIZE:
            _CACHE.popitem(last=False)


def clear_cache() -> int:
    """Flush the entire cache. Returns the number of entries removed."""
    with _CACHE_LOCK:
        count = len(_CACHE)
        _CACHE.clear()
        return count


def cache_size() -> int:
    with _CACHE_LOCK:
        return len(_CACHE)

# Alias for backwards compatibility with main.py
clear_cached_results = clear_cache