from collections import OrderedDict
from threading import Lock
from typing import Dict, List, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from app.vector_store import get_all_chunks

# Maximum number of TF-IDF index entries to keep in memory.
# Each entry holds a vectorizer + sparse matrix for one workspace/document-set.
# Oldest entries are evicted when the limit is reached.
_MAX_CACHE_SIZE = 8

# (workspace_id, document_set_hash) → (vectorizer, matrix, chunks)
_INDEX_CACHE: OrderedDict[Tuple[str, str], Tuple] = OrderedDict()
_CACHE_LOCK = Lock()


def _build_index(workspace_id: str, document_set_hash: str) -> Tuple:
    """
    Build a TF-IDF index for the workspace. Results are cached by
    (workspace_id, document_set_hash).  When the document set changes
    (upload/delete), document_set_hash changes and the stale entry is
    naturally bypassed; the LRU eviction ensures the old entry is
    eventually freed rather than accumulating forever.
    """
    cache_key = (workspace_id, document_set_hash)

    with _CACHE_LOCK:
        if cache_key in _INDEX_CACHE:
            # move to end = most-recently-used
            _INDEX_CACHE.move_to_end(cache_key)
            return _INDEX_CACHE[cache_key]

    # build outside the lock — this can be slow for large workspaces
    chunks = get_all_chunks(workspace_id)
    if not chunks:
        entry = (None, None, [])
    else:
        texts = [chunk["chunk_text"] for chunk in chunks]
        vectorizer = TfidfVectorizer(stop_words="english")
        matrix = vectorizer.fit_transform(texts)
        entry = (vectorizer, matrix, chunks)

    with _CACHE_LOCK:
        # another thread may have built the same key concurrently — that's fine,
        # last writer wins and the duplicate entry replaces the earlier one.
        _INDEX_CACHE[cache_key] = entry
        _INDEX_CACHE.move_to_end(cache_key)

        # evict oldest entries beyond the size cap
        while len(_INDEX_CACHE) > _MAX_CACHE_SIZE:
            _INDEX_CACHE.popitem(last=False)

    return entry


def keyword_search(
    workspace_id: str,
    query: str,
    document_set_hash: str,
    top_k: int = 10,
    document_ids: List[str] | None = None,
) -> List[Dict]:
    vectorizer, matrix, chunks = _build_index(workspace_id, document_set_hash)
    if not chunks or vectorizer is None or matrix is None:
        return []

    query_vector = vectorizer.transform([query])
    scores = (matrix @ query_vector.T).toarray().ravel()
    ranked_indices = np.argsort(scores)[::-1][:top_k]

    results: List[Dict] = []
    for index in ranked_indices:
        score = float(scores[index])
        if score <= 0:
            continue
        item = dict(chunks[index])
        if document_ids and item["document_id"] not in document_ids:
            continue
        item["keyword_score"] = score
        results.append(item)
    return results


def invalidate_workspace_index(workspace_id: str) -> int:
    """
    Remove all cached index entries for a workspace.
    Call this after uploading or deleting a document if you want
    immediate eviction rather than waiting for LRU pressure.
    Returns the number of entries removed.
    """
    with _CACHE_LOCK:
        keys_to_remove = [key for key in _INDEX_CACHE if key[0] == workspace_id]
        for key in keys_to_remove:
            del _INDEX_CACHE[key]
    return len(keys_to_remove)

# keyword_index.py

_keyword_cache = {}

def clear_keyword_index_cache():
    """
    Clears the in-memory keyword index cache.
    Safe fallback implementation.
    """
    global _keyword_cache
    _keyword_cache.clear()