from functools import lru_cache
from typing import Dict, List

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

from app.vector_store import get_all_chunks


@lru_cache(maxsize=8)
def _build_index(workspace_id: str, document_set_hash: str):
    chunks = get_all_chunks(workspace_id)
    if not chunks:
        return None, None, []
    texts = [chunk["chunk_text"] for chunk in chunks]
    vectorizer = TfidfVectorizer(stop_words="english")
    matrix = vectorizer.fit_transform(texts)
    return vectorizer, matrix, chunks


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
