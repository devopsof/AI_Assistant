from typing import Dict, Optional


_QUERY_CACHE: Dict[str, Dict] = {}


def get_cached_result(cache_key: str) -> Optional[Dict]:
    return _QUERY_CACHE.get(cache_key)


def store_cached_result(cache_key: str, result: Dict) -> None:
    _QUERY_CACHE[cache_key] = result
