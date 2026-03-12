from time import perf_counter
from typing import Dict, List

from app.document_registry import list_document_records
from app.document_selector import detect_relevant_collections, select_relevant_documents
from app.document_registry import get_document_set_hash
from app.embeddings import generate_embedding
from app.keyword_index import keyword_search
from app.logging_utils import get_logger, log_event
from app.query_preprocessor import preprocess_query
from app.vector_store import get_chunk_neighbors, similarity_search

logger = get_logger("hybrid_retrieval")


def _normalize_vector_score(distance: float) -> float:
    return 1.0 / (1.0 + max(distance, 0.0))


def _rerank_results(
    workspace_id: str,
    vector_results: List[Dict],
    keyword_results: List[Dict],
    final_k: int = 5,
) -> List[Dict]:
    combined: Dict[tuple[str, str], Dict] = {}

    for item in vector_results:
        key = (item["document_id"], item["chunk_id"])
        combined[key] = {
            **item,
            "vector_score": _normalize_vector_score(float(item.get("similarity_score", 1.0))),
            "keyword_score": float(item.get("keyword_score", 0.0)),
        }

    for item in keyword_results:
        key = (item["document_id"], item["chunk_id"])
        current = combined.get(
            key,
            {
                **item,
                "similarity_score": 1.0,
                "vector_score": 0.0,
            },
        )
        current["keyword_score"] = max(float(current.get("keyword_score", 0.0)), float(item.get("keyword_score", 0.0)))
        current["chunk_text"] = item["chunk_text"]
        current["document_name"] = item["document_name"]
        current["chunk_index"] = item["chunk_index"]
        current["upload_timestamp"] = item["upload_timestamp"]
        combined[key] = current

    reranked = []
    for item in combined.values():
        item["combined_score"] = round((0.65 * item["vector_score"]) + (0.35 * item["keyword_score"]), 6)
        neighbors = get_chunk_neighbors(workspace_id, item["document_id"], item["chunk_index"])
        item.update(neighbors)
        reranked.append(item)

    reranked.sort(key=lambda chunk: chunk["combined_score"], reverse=True)
    return reranked[:final_k]


def hybrid_search(
    workspace_id: str,
    query: str,
    vector_top_k: int = 10,
    final_k: int = 5,
    document_ids: List[str] | None = None,
) -> Dict:
    preprocessed = preprocess_query(query)
    document_set_hash = get_document_set_hash(workspace_id, document_ids=document_ids)
    candidate_document_ids = select_relevant_documents(
        workspace_id,
        preprocessed["keyword_query"] or preprocessed["normalized_query"] or query,
        allowed_document_ids=document_ids,
    )
    relevant_collection_ids = detect_relevant_collections(
        workspace_id,
        preprocessed["keyword_query"] or preprocessed["normalized_query"] or query,
    )
    if relevant_collection_ids:
        collection_document_ids = [
            record["document_id"]
            for record in list_document_records(workspace_id)
            if record.get("collection_id") in relevant_collection_ids
            and (not document_ids or record["document_id"] in document_ids)
        ]
        candidate_document_ids = list(dict.fromkeys(collection_document_ids + candidate_document_ids))
    if document_ids:
        candidate_document_ids = [document_id for document_id in candidate_document_ids if document_id in document_ids]
        if not candidate_document_ids:
            candidate_document_ids = list(document_ids)

    vector_started_at = perf_counter()
    query_embedding = generate_embedding(preprocessed["normalized_query"] or query)
    vector_results = similarity_search(
        workspace_id,
        query_embedding,
        top_k=vector_top_k,
        document_ids=candidate_document_ids or None,
    )
    vector_latency_ms = round((perf_counter() - vector_started_at) * 1000, 2)

    keyword_started_at = perf_counter()
    keyword_results = keyword_search(
        workspace_id,
        preprocessed["keyword_query"] or preprocessed["normalized_query"] or query,
        document_set_hash=document_set_hash,
        top_k=vector_top_k,
        document_ids=candidate_document_ids or None,
    )
    keyword_latency_ms = round((perf_counter() - keyword_started_at) * 1000, 2)

    reranked_results = _rerank_results(workspace_id, vector_results, keyword_results, final_k=final_k)

    log_event(
        logger,
        "hybrid_retrieval_completed",
        workspace_id=workspace_id,
        query=query,
        normalized_query=preprocessed["normalized_query"],
        keyword_query=preprocessed["keyword_query"],
        intent=preprocessed["intent"],
        vector_latency_ms=vector_latency_ms,
        keyword_latency_ms=keyword_latency_ms,
        vector_candidate_count=len(vector_results),
        keyword_candidate_count=len(keyword_results),
        reranked_count=len(reranked_results),
        candidate_document_ids=candidate_document_ids,
        relevant_collection_ids=relevant_collection_ids,
    )

    return {
        "results": reranked_results,
        "document_set_hash": document_set_hash,
        "normalized_query": preprocessed["normalized_query"],
        "keyword_query": preprocessed["keyword_query"],
        "intent": preprocessed["intent"],
        "vector_latency_ms": vector_latency_ms,
        "keyword_latency_ms": keyword_latency_ms,
        "candidate_document_ids": candidate_document_ids,
        "relevant_collection_ids": relevant_collection_ids,
    }
