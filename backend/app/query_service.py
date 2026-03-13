from time import perf_counter
import re
import json

from app.conversation_memory import append_message, ensure_conversation, get_messages
from app.document_registry import (
    attach_document_to_conversation,
    get_conversation_document_ids,
    get_document_set_hash,
    list_document_records,
)
from app.knowledge_graph_builder import describe_connection_query
from app.logging_utils import get_logger, log_event
from app.models import (
    QueryResponse,
    SearchResponse,
    SearchResult,
    SourceMetadata,
)
from app.query_cache import get_cached_result, store_cached_result
from app.query_rewriter import rewrite_query
from app.rag_pipeline import run_rag_pipeline, stream_rag_pipeline
from app.session_store import ensure_session, record_session_query

logger = get_logger("query_service")

DOCUMENT_QUERY_PATTERN = re.compile(
    r"\b(which|what)\s+documents?\s+(talk|mention|cover|discuss|are about)\b",
    re.IGNORECASE,
)
CONNECTION_QUERY_PATTERN = re.compile(
    r"\bconnections?\s+between\s+(?P<first>[A-Za-z0-9\-\s]+)\s+and\s+(?P<second>[A-Za-z0-9\-\s]+)",
    re.IGNORECASE,
)


def _confidence_score(retrieved_chunks: list[dict]) -> float:
    if not retrieved_chunks:
        return 0.0
    top_score = float(retrieved_chunks[0].get("combined_score", 0.0))
    second_score = float(retrieved_chunks[1].get("combined_score", 0.0)) if len(retrieved_chunks) > 1 else 0.0
    support_bonus = min(len(retrieved_chunks), 5) * 0.05
    gap_bonus = max(top_score - second_score, 0.0)
    return round(min(top_score + gap_bonus + support_bonus, 0.99), 2)


def _suggest_queries(question: str, retrieved_chunks: list[dict]) -> list[str]:
    if retrieved_chunks:
        top_doc = retrieved_chunks[0].get("document_name", "document")
        chunk_text = retrieved_chunks[0].get("chunk_text", "")
        keywords = [word.strip(".,") for word in chunk_text.split() if len(word) > 6][:3]
        return [f"What is {keywords[0]}?" for _ in range(1) if keywords] + [
            f"What does {top_doc} say about {keyword}?" for keyword in keywords[1:3]
        ]
    subject = question.strip().rstrip("?")
    return [
        f"What is {subject}?",
        f"Who developed {subject}?",
        f"What does {subject} do?",
    ]


def _document_intelligence_answer(
    workspace_id: str,
    question: str,
    conversation_id: str | None = None,
) -> QueryResponse | None:
    if not DOCUMENT_QUERY_PATTERN.search(question):
        return None

    query_terms = {
        token.lower()
        for token in re.findall(r"[A-Za-z][A-Za-z\-]{2,}", question)
        if token.lower() not in {"which", "what", "documents", "document", "talk", "mention", "cover", "discuss", "about"}
    }
    if not query_terms:
        return None

    matches = []
    for record in list_document_records(workspace_id, conversation_id):
        searchable = " ".join(
            [
                record.get("file_name", ""),
                record.get("summary", ""),
                " ".join(record.get("topics", [])),
                " ".join(record.get("entities", [])),
                " ".join(record.get("concepts", [])),
            ]
        ).lower()
        score = sum(1 for term in query_terms if term in searchable)
        if score > 0:
            matches.append((score, record))

    matches.sort(key=lambda item: item[0], reverse=True)
    if not matches:
        return None

    top_matches = [record for _, record in matches[:5]]
    answer_lines = [
        f"- {record['file_name']}: {record.get('summary', 'No summary available.')}"
        for record in top_matches
    ]
    return QueryResponse(
        answer="Here are the most relevant documents:\n" + "\n".join(answer_lines),
        conversation_id="",
        session_id="",
        rewritten_query=question,
        confidence=0.82,
        suggestions=[],
        debug={"document_intelligence": True, "matched_documents": len(top_matches)},
        sources=[
            SourceMetadata(
                document_id=record["document_id"],
                document=record["file_name"],
                chunk="summary",
                chunk_index=0,
                upload_timestamp=record["upload_timestamp"],
                similarity_score=1.0,
                chunk_text=record.get("summary", ""),
            )
            for record in top_matches
        ],
    )


def _graph_relationship_answer(
    workspace_id: str,
    question: str,
    conversation_id: str | None = None,
) -> QueryResponse | None:
    match = CONNECTION_QUERY_PATTERN.search(question)
    if not match:
        return None
    relationship = describe_connection_query(
        workspace_id,
        match.group("first").strip(),
        match.group("second").strip(),
        conversation_id,
    )
    if not relationship:
        return None

    shared = relationship["shared_labels"]
    shared_text = ", ".join(shared) if shared else "No direct shared topic or entity was found."
    return QueryResponse(
        answer=(
            f"Relationship between {relationship['first']['label']} and {relationship['second']['label']}:\n"
            f"{shared_text}"
        ),
        conversation_id="",
        session_id="",
        rewritten_query=question,
        confidence=0.79,
        suggestions=[],
        debug={"knowledge_graph": True, "shared_labels": shared},
        insights=[
            {
                "theme": "Knowledge graph relationship",
                "documents": relationship["first"].get("documents", []) + relationship["second"].get("documents", []),
                "key_points": shared or ["No shared intermediaries found."],
            }
        ],
        themes=["knowledge graph relationship"],
        sources=[],
    )


def _resolve_session_and_conversation(
    workspace_id: str,
    conversation_id: str | None,
    session_id: str | None,
) -> tuple[str, str]:
    resolved_session_id = ensure_session(workspace_id, session_id)
    resolved_conversation_id = ensure_conversation(workspace_id, conversation_id, resolved_session_id)
    return resolved_session_id, resolved_conversation_id


def _build_sources(retrieved_chunks: list[dict], workspace_id: str) -> list[SourceMetadata]:
    sources = []
    seen: set[tuple[str, str]] = set()
    for item in retrieved_chunks:
        dedupe_key = (item["document_id"], item["chunk_id"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        sources.append(
            SourceMetadata(
                document_id=item["document_id"],
                document=item["document_name"],
                chunk=item["chunk_id"],
                chunk_index=item["chunk_index"],
                upload_timestamp=item["upload_timestamp"],
                similarity_score=float(item["combined_score"]),
                chunk_text=item["chunk_text"],
                previous_chunk_text=item.get("previous_chunk_text"),
                next_chunk_text=item.get("next_chunk_text"),
            )
        )
    return sources


def answer_question(
    workspace_id: str,
    question: str,
    conversation_id: str | None = None,
    session_id: str | None = None,
) -> QueryResponse:
    started_at = perf_counter()
    resolved_session_id, resolved_conversation_id = _resolve_session_and_conversation(
        workspace_id, conversation_id, session_id
    )
    record_session_query(workspace_id, resolved_session_id, question)
    conversation_messages = get_messages(workspace_id, resolved_conversation_id)
    rewritten_query = rewrite_query(question, conversation_messages)
    scoped_document_ids = get_conversation_document_ids(workspace_id, resolved_conversation_id)
    document_set_hash = get_document_set_hash(
        workspace_id,
        document_ids=scoped_document_ids or None,
    )
    cache_key = f"{workspace_id}::{rewritten_query.strip().lower()}::{document_set_hash}"

    log_event(
        logger,
        "query_received",
        workspace_id=workspace_id,
        session_id=resolved_session_id,
        conversation_id=resolved_conversation_id,
        question=question,
        rewritten_query=rewritten_query,
        prior_message_count=len(conversation_messages),
        scoped_document_count=len(scoped_document_ids),
    )

    intelligence_response = _document_intelligence_answer(
        workspace_id, rewritten_query, resolved_conversation_id
    )
    if intelligence_response:
        intelligence_response.conversation_id = resolved_conversation_id
        intelligence_response.session_id = resolved_session_id
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", intelligence_response.answer, resolved_session_id)
        return intelligence_response

    graph_response = _graph_relationship_answer(
        workspace_id, rewritten_query, resolved_conversation_id
    )
    if graph_response:
        graph_response.conversation_id = resolved_conversation_id
        graph_response.session_id = resolved_session_id
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", graph_response.answer, resolved_session_id)
        return graph_response

    cached = get_cached_result(cache_key)
    if cached:
        log_event(logger, "query_cache_hit", workspace_id=workspace_id, question=question)
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", cached["answer"], resolved_session_id)
        cached["conversation_id"] = resolved_conversation_id
        cached["session_id"] = resolved_session_id
        return QueryResponse(**cached)

    if not scoped_document_ids:
        empty_response = QueryResponse(
            answer="This chat does not have any documents yet. Upload a document in this chat to start asking questions.",
            conversation_id=resolved_conversation_id,
            session_id=resolved_session_id,
            rewritten_query=rewritten_query,
            confidence=0.0,
            suggestions=[],
            debug={"intent": "empty_chat"},
            insights=[],
            themes=[],
            sources=[],
        )
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", empty_response.answer, resolved_session_id)
        return empty_response

    result = run_rag_pipeline(
        workspace_id, rewritten_query, conversation_messages, document_ids=scoped_document_ids
    )
    append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
    append_message(workspace_id, resolved_conversation_id, "assistant", result["answer"], resolved_session_id)
    for item in result["retrieved_chunks"]:
        attach_document_to_conversation(workspace_id, item["document_id"], resolved_conversation_id)

    sources = _build_sources(result["retrieved_chunks"], workspace_id)
    confidence = _confidence_score(result["retrieved_chunks"])
    suggestions = [] if confidence >= 0.45 else _suggest_queries(rewritten_query, result["retrieved_chunks"])
    debug = {
        "vector_retrieval_ms": result["vector_retrieval_ms"],
        "keyword_retrieval_ms": result["keyword_retrieval_ms"],
        "retrieval_latency_ms": result["retrieval_latency_ms"],
        "llm_latency_ms": result["llm_latency_ms"],
        "synthesis_time_ms": result.get("synthesis_time_ms", 0.0),
        "selected_chunks": [
            {"document": item["document_name"], "chunk": item["chunk_id"], "combined_score": item["combined_score"]}
            for item in result["retrieved_chunks"]
        ],
        "candidate_document_ids": result["candidate_document_ids"],
        "relevant_collection_ids": result.get("relevant_collection_ids", []),
        "normalized_query": result["normalized_query"],
        "keyword_query": result["keyword_query"],
        "intent": result["intent"],
        "themes_detected": result.get("themes", []),
        "documents_used": result.get("documents_used", []),
        "scope": "conversation",
        "scoped_document_ids": scoped_document_ids,
    }

    query_execution_ms = round((perf_counter() - started_at) * 1000, 2)
    log_event(
        logger,
        "query_completed",
        workspace_id=workspace_id,
        session_id=resolved_session_id,
        conversation_id=resolved_conversation_id,
        question=question,
        query_execution_ms=query_execution_ms,
        confidence=confidence,
    )

    response = QueryResponse(
        answer=result["answer"],
        conversation_id=resolved_conversation_id,
        session_id=resolved_session_id,
        rewritten_query=rewritten_query,
        confidence=confidence,
        suggestions=suggestions,
        debug=debug,
        insights=result.get("insights", []),
        themes=result.get("themes", []),
        sources=sources,
    )
    store_cached_result(cache_key, response.model_dump())
    return response


def format_search_results(results: list[dict]) -> SearchResponse:
    return SearchResponse(
        results=[
            SearchResult(
                document_id=item["document_id"],
                document=item["document_name"],
                chunk_index=item["chunk_index"],
                chunk_id=item["chunk_id"],
                text=item["chunk_text"],
                previous_chunk_text=item.get("previous_chunk_text"),
                next_chunk_text=item.get("next_chunk_text"),
                similarity_score=float(item.get("vector_score", 0.0)),
                keyword_score=float(item.get("keyword_score", 0.0)),
                combined_score=float(item.get("combined_score", 0.0)),
            )
            for item in results
        ]
    )


def stream_answer_events(
    workspace_id: str,
    question: str,
    conversation_id: str | None = None,
    session_id: str | None = None,
):
    """
    Real SSE generator backed by the LLM's streaming API.

    Event sequence:
      event: meta   — retrieval results and sources (before first token)
      event: chunk  — incremental token deltas from the LLM
      event: done   — full assembled answer plus complete QueryResponse payload
    """
    resolved_session_id, resolved_conversation_id = _resolve_session_and_conversation(
        workspace_id, conversation_id, session_id
    )
    record_session_query(workspace_id, resolved_session_id, question)
    conversation_messages = get_messages(workspace_id, resolved_conversation_id)
    rewritten_query = rewrite_query(question, conversation_messages)
    scoped_document_ids = get_conversation_document_ids(workspace_id, resolved_conversation_id)

    log_event(
        logger,
        "stream_query_received",
        workspace_id=workspace_id,
        session_id=resolved_session_id,
        conversation_id=resolved_conversation_id,
        question=question,
        rewritten_query=rewritten_query,
        scoped_document_count=len(scoped_document_ids),
    )

    # --- fast-path: no documents ---
    if not scoped_document_ids:
        empty_answer = "This chat does not have any documents yet. Upload a document in this chat to start asking questions."
        meta_payload = {
            "conversation_id": resolved_conversation_id,
            "session_id": resolved_session_id,
            "rewritten_query": rewritten_query,
            "sources": [],
            "insights": [],
            "themes": [],
        }
        yield f"event: meta\ndata: {json.dumps(meta_payload)}\n\n"
        yield f"event: chunk\ndata: {json.dumps({'content': empty_answer})}\n\n"
        done_payload = {
            "answer": empty_answer,
            "conversation_id": resolved_conversation_id,
            "session_id": resolved_session_id,
            "rewritten_query": rewritten_query,
            "confidence": 0.0,
            "suggestions": [],
            "debug": {"intent": "empty_chat"},
            "insights": [],
            "themes": [],
            "sources": [],
        }
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", empty_answer, resolved_session_id)
        yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"
        return

    # --- check intelligence / graph shortcuts first (these are instant) ---
    intelligence_response = _document_intelligence_answer(workspace_id, rewritten_query, resolved_conversation_id)
    if intelligence_response:
        intelligence_response.conversation_id = resolved_conversation_id
        intelligence_response.session_id = resolved_session_id
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", intelligence_response.answer, resolved_session_id)
        payload = intelligence_response.model_dump()
        yield f"event: meta\ndata: {json.dumps({k: v for k, v in payload.items() if k != 'answer'})}\n\n"
        yield f"event: chunk\ndata: {json.dumps({'content': intelligence_response.answer})}\n\n"
        yield f"event: done\ndata: {json.dumps(payload)}\n\n"
        return

    graph_response = _graph_relationship_answer(workspace_id, rewritten_query, resolved_conversation_id)
    if graph_response:
        graph_response.conversation_id = resolved_conversation_id
        graph_response.session_id = resolved_session_id
        append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
        append_message(workspace_id, resolved_conversation_id, "assistant", graph_response.answer, resolved_session_id)
        payload = graph_response.model_dump()
        yield f"event: meta\ndata: {json.dumps({k: v for k, v in payload.items() if k != 'answer'})}\n\n"
        yield f"event: chunk\ndata: {json.dumps({'content': graph_response.answer})}\n\n"
        yield f"event: done\ndata: {json.dumps(payload)}\n\n"
        return

    # --- real streaming RAG pipeline ---
    retrieval_meta: dict = {}
    accumulated_answer = ""

    for event in stream_rag_pipeline(
        workspace_id,
        rewritten_query,
        conversation_messages,
        document_ids=scoped_document_ids,
    ):
        event_type = event["type"]

        if event_type == "meta":
            retrieval_meta = event
            retrieved_chunks = event.get("retrieved_chunks", [])
            sources = _build_sources(retrieved_chunks, workspace_id)
            meta_payload = {
                "conversation_id": resolved_conversation_id,
                "session_id": resolved_session_id,
                "rewritten_query": rewritten_query,
                "sources": [s.model_dump() for s in sources],
                "insights": event.get("insights", []),
                "themes": event.get("themes", []),
                "retrieval_latency_ms": event.get("retrieval_latency_ms"),
                "vector_retrieval_ms": event.get("vector_retrieval_ms"),
                "keyword_retrieval_ms": event.get("keyword_retrieval_ms"),
            }
            yield f"event: meta\ndata: {json.dumps(meta_payload)}\n\n"

            # attach documents to conversation as soon as we have them
            for chunk in retrieved_chunks:
                attach_document_to_conversation(workspace_id, chunk["document_id"], resolved_conversation_id)

        elif event_type == "chunk":
            delta = event.get("content", "")
            accumulated_answer += delta
            yield f"event: chunk\ndata: {json.dumps({'content': delta})}\n\n"

        elif event_type == "error":
            # LLM failed — the pipeline already emits a fallback chunk, just log
            log_event(logger, "stream_llm_error", workspace_id=workspace_id, message=event.get("message", ""))

        elif event_type == "done":
            full_answer = event.get("answer", accumulated_answer).strip() or "I do not know."
            llm_latency_ms = event.get("llm_latency_ms", 0.0)
            retrieved_chunks = retrieval_meta.get("retrieved_chunks", [])
            sources = _build_sources(retrieved_chunks, workspace_id)
            confidence = _confidence_score(retrieved_chunks)
            suggestions = [] if confidence >= 0.45 else _suggest_queries(rewritten_query, retrieved_chunks)

            debug = {
                "vector_retrieval_ms": retrieval_meta.get("vector_retrieval_ms", 0.0),
                "keyword_retrieval_ms": retrieval_meta.get("keyword_retrieval_ms", 0.0),
                "retrieval_latency_ms": retrieval_meta.get("retrieval_latency_ms", 0.0),
                "llm_latency_ms": llm_latency_ms,
                "synthesis_time_ms": retrieval_meta.get("synthesis_time_ms", 0.0),
                "selected_chunks": [
                    {"document": c["document_name"], "chunk": c["chunk_id"], "combined_score": c["combined_score"]}
                    for c in retrieved_chunks
                ],
                "candidate_document_ids": retrieval_meta.get("candidate_document_ids", []),
                "relevant_collection_ids": retrieval_meta.get("relevant_collection_ids", []),
                "normalized_query": retrieval_meta.get("normalized_query", rewritten_query),
                "keyword_query": retrieval_meta.get("keyword_query", ""),
                "intent": retrieval_meta.get("intent", ""),
                "themes_detected": retrieval_meta.get("themes", []),
                "documents_used": retrieval_meta.get("documents_used", []),
                "scope": "conversation",
                "scoped_document_ids": scoped_document_ids,
                "streamed": True,
            }

            done_payload = {
                "answer": full_answer,
                "conversation_id": resolved_conversation_id,
                "session_id": resolved_session_id,
                "rewritten_query": rewritten_query,
                "confidence": confidence,
                "suggestions": suggestions,
                "debug": debug,
                "insights": retrieval_meta.get("insights", []),
                "themes": retrieval_meta.get("themes", []),
                "sources": [s.model_dump() for s in sources],
            }

            append_message(workspace_id, resolved_conversation_id, "user", question, resolved_session_id)
            append_message(workspace_id, resolved_conversation_id, "assistant", full_answer, resolved_session_id)
            yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"