from time import perf_counter
from typing import Dict, Generator, List

import openai
from openai import OpenAI

from app.config import get_settings
from app.hybrid_retrieval import hybrid_search
from app.knowledge_synthesizer import build_synthesized_context
from app.logging_utils import get_logger, log_event

logger = get_logger("rag_pipeline")

LLM_TIMEOUT_SECONDS = 30


def _get_client() -> OpenAI:
    settings = get_settings()
    if not settings.groq_api_key or settings.groq_api_key.startswith("your_"):
        raise ValueError("GROQ_API_KEY is not configured.")
    return OpenAI(
        api_key=settings.groq_api_key,
        base_url=settings.groq_base_url,
        timeout=LLM_TIMEOUT_SECONDS,
    )


def _fallback_answer(question: str, synthesis: Dict, retrieved_chunks: List[Dict]) -> str:
    if synthesis.get("insights"):
        lines = []
        for insight in synthesis["insights"][:3]:
            if insight.get("key_points"):
                lines.append(f"{insight['theme']}: {insight['key_points'][0]}")
        if lines:
            return "Here is a grounded answer from your documents:\n" + "\n".join(f"- {line}" for line in lines)

    if retrieved_chunks:
        excerpts = [chunk["chunk_text"].strip() for chunk in retrieved_chunks[:3] if chunk.get("chunk_text")]
        if excerpts:
            return "Here is what your uploaded documents say:\n" + "\n".join(f"- {excerpt}" for excerpt in excerpts)

    return "I do not know."


def build_prompt(
    question: str,
    retrieved_chunks: List[Dict],
    conversation_messages: List[Dict],
    synthesized_context: str,
) -> str:
    history = "\n".join(
        f"{message['role'].title()}: {message['content']}" for message in conversation_messages[-6:]
    )
    history_block = history if history else "No previous messages."

    context_blocks = []
    for item in retrieved_chunks[:6]:
        context_blocks.append(
            f"Source: {item['document_name']} | chunk: {item['chunk_id']} | "
            f"combined_score: {item['combined_score']}\n{item['chunk_text']}"
        )

    supporting_context = "\n\n".join(context_blocks) if context_blocks else "No supporting chunks available."
    return (
        "You are an AI assistant that answers questions using the user's documents.\n\n"
        "Rules:\n"
        "- Only use the provided context\n"
        "- Do not hallucinate information\n"
        '- If the answer is not in the context say "I do not know"\n\n'
        "Instructions:\n"
        "- Combine insights across documents when relevant\n"
        "- Identify common themes and note disagreements if they appear\n"
        "- Prefer synthesized findings first, then support them with document evidence\n\n"
        f"Conversation History:\n{history_block}\n\n"
        f"Synthesized Context:\n{synthesized_context}\n\n"
        f"Supporting Chunks:\n{supporting_context}\n\n"
        f"Question:\n{question}\n\n"
        "Answer:"
    )


def _build_messages(prompt: str) -> List[Dict]:
    return [
        {
            "role": "system",
            "content": (
                "You are a grounded question-answering assistant. "
                "Answer only from the supplied context."
            ),
        },
        {"role": "user", "content": prompt},
    ]


def _retrieve(
    workspace_id: str,
    question: str,
    document_ids: List[str] | None,
) -> tuple[Dict, List[Dict], Dict, str, float]:
    """Run hybrid retrieval and synthesis. Returns (retrieval, chunks, synthesis, prompt, latency_ms)."""
    settings = get_settings()
    started_at = perf_counter()
    retrieval = hybrid_search(
        workspace_id,
        question,
        vector_top_k=max(settings.top_k_results * 4, 15),
        final_k=settings.top_k_results,
        document_ids=document_ids,
    )
    latency_ms = round((perf_counter() - started_at) * 1000, 2)
    retrieved_chunks = retrieval["results"]
    synthesis = build_synthesized_context(workspace_id, retrieved_chunks)
    prompt = build_prompt(question, retrieved_chunks, [], synthesis["context"])
    return retrieval, retrieved_chunks, synthesis, prompt, latency_ms


def run_rag_pipeline(
    workspace_id: str,
    question: str,
    conversation_messages: List[Dict],
    document_ids: List[str] | None = None,
) -> Dict:
    """Non-streaming pipeline. Returns a fully assembled result dict."""
    settings = get_settings()
    retrieval_started_at = perf_counter()
    retrieval = hybrid_search(
        workspace_id,
        question,
        vector_top_k=max(settings.top_k_results * 4, 15),
        final_k=settings.top_k_results,
        document_ids=document_ids,
    )
    retrieval_latency_ms = round((perf_counter() - retrieval_started_at) * 1000, 2)
    retrieved_chunks = retrieval["results"]
    synthesis = build_synthesized_context(workspace_id, retrieved_chunks)
    prompt = build_prompt(question, retrieved_chunks, conversation_messages, synthesis["context"])

    log_event(
        logger,
        "retrieval_completed",
        workspace_id=workspace_id,
        query=question,
        normalized_query=retrieval["normalized_query"],
        keyword_query=retrieval["keyword_query"],
        intent=retrieval["intent"],
        retrieved_chunk_count=len(retrieved_chunks),
        documents_used=synthesis["documents_used"],
        themes_detected=[theme["theme"] for theme in synthesis["themes"]],
        synthesis_time_ms=synthesis["synthesis_time_ms"],
        vector_retrieval_ms=retrieval["vector_latency_ms"],
        keyword_retrieval_ms=retrieval["keyword_latency_ms"],
        retrieval_latency_ms=retrieval_latency_ms,
    )

    llm_started_at = perf_counter()
    answer = ""
    fallback_reason = ""
    try:
        client = _get_client()
        response = client.chat.completions.create(
            model=settings.groq_chat_model,
            messages=_build_messages(prompt),
        )
        answer = response.choices[0].message.content or "I do not know."
    except openai.APITimeoutError as exc:
        logger.error("LLM call timed out after %ss: %s", LLM_TIMEOUT_SECONDS, exc)
        fallback_reason = str(exc)
        answer = _fallback_answer(question, synthesis, retrieved_chunks)
    except openai.APIConnectionError as exc:
        logger.error("LLM connection error: %s", exc)
        fallback_reason = str(exc)
        answer = _fallback_answer(question, synthesis, retrieved_chunks)
    except Exception as exc:
        fallback_reason = str(exc)
        answer = _fallback_answer(question, synthesis, retrieved_chunks)
    llm_latency_ms = round((perf_counter() - llm_started_at) * 1000, 2)

    log_event(
        logger,
        "response_generated",
        workspace_id=workspace_id,
        query=question,
        llm_latency_ms=llm_latency_ms,
        retrieved_chunk_count=len(retrieved_chunks),
        used_fallback=bool(fallback_reason),
        fallback_reason=fallback_reason,
    )

    return {
        "answer": answer.strip(),
        "retrieved_chunks": retrieved_chunks,
        "retrieval_latency_ms": retrieval_latency_ms,
        "vector_retrieval_ms": retrieval["vector_latency_ms"],
        "keyword_retrieval_ms": retrieval["keyword_latency_ms"],
        "llm_latency_ms": llm_latency_ms,
        "document_set_hash": retrieval["document_set_hash"],
        "candidate_document_ids": retrieval["candidate_document_ids"],
        "relevant_collection_ids": retrieval.get("relevant_collection_ids", []),
        "normalized_query": retrieval["normalized_query"],
        "keyword_query": retrieval["keyword_query"],
        "intent": retrieval["intent"],
        "insights": synthesis["insights"],
        "themes": [theme["theme"] for theme in synthesis["themes"]],
        "documents_used": synthesis["documents_used"],
        "synthesis_time_ms": synthesis["synthesis_time_ms"],
    }


def stream_rag_pipeline(
    workspace_id: str,
    question: str,
    conversation_messages: List[Dict],
    document_ids: List[str] | None = None,
) -> Generator[Dict, None, None]:
    """
    Streaming pipeline. Yields dicts of two shapes:

      {"type": "meta",  ...retrieval metadata...}
      {"type": "chunk", "content": "<token text>"}
      {"type": "done",  "answer": "<full answer>"}
      {"type": "error", "message": "<error text>"}   (on LLM failure, falls back to full answer)
    """
    settings = get_settings()

    # --- retrieval (blocking, happens before first token) ---
    retrieval_started_at = perf_counter()
    retrieval = hybrid_search(
        workspace_id,
        question,
        vector_top_k=max(settings.top_k_results * 4, 15),
        final_k=settings.top_k_results,
        document_ids=document_ids,
    )
    retrieval_latency_ms = round((perf_counter() - retrieval_started_at) * 1000, 2)
    retrieved_chunks = retrieval["results"]
    synthesis = build_synthesized_context(workspace_id, retrieved_chunks)
    prompt = build_prompt(question, retrieved_chunks, conversation_messages, synthesis["context"])

    log_event(
        logger,
        "retrieval_completed",
        workspace_id=workspace_id,
        query=question,
        normalized_query=retrieval["normalized_query"],
        keyword_query=retrieval["keyword_query"],
        intent=retrieval["intent"],
        retrieved_chunk_count=len(retrieved_chunks),
        documents_used=synthesis["documents_used"],
        themes_detected=[theme["theme"] for theme in synthesis["themes"]],
        synthesis_time_ms=synthesis["synthesis_time_ms"],
        vector_retrieval_ms=retrieval["vector_latency_ms"],
        keyword_retrieval_ms=retrieval["keyword_latency_ms"],
        retrieval_latency_ms=retrieval_latency_ms,
    )

    # emit retrieval metadata so the client can render sources immediately
    yield {
        "type": "meta",
        "retrieved_chunks": retrieved_chunks,
        "retrieval_latency_ms": retrieval_latency_ms,
        "vector_retrieval_ms": retrieval["vector_latency_ms"],
        "keyword_retrieval_ms": retrieval["keyword_latency_ms"],
        "document_set_hash": retrieval["document_set_hash"],
        "candidate_document_ids": retrieval["candidate_document_ids"],
        "relevant_collection_ids": retrieval.get("relevant_collection_ids", []),
        "normalized_query": retrieval["normalized_query"],
        "keyword_query": retrieval["keyword_query"],
        "intent": retrieval["intent"],
        "insights": synthesis["insights"],
        "themes": [theme["theme"] for theme in synthesis["themes"]],
        "documents_used": synthesis["documents_used"],
        "synthesis_time_ms": synthesis["synthesis_time_ms"],
    }

    # --- streaming LLM call ---
    llm_started_at = perf_counter()
    accumulated = []
    fallback_reason = ""

    try:
        client = _get_client()
        stream = client.chat.completions.create(
            model=settings.groq_chat_model,
            messages=_build_messages(prompt),
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                accumulated.append(delta)
                yield {"type": "chunk", "content": delta}
    except openai.APITimeoutError as exc:
        logger.error("LLM call timed out after %ss: %s", LLM_TIMEOUT_SECONDS, exc)
        yield {"type": "error", "message": "LLM request timed out"}
        yield {"type": "done", "answer": "".join(accumulated).strip()}
        return
    except openai.APIConnectionError as exc:
        logger.error("LLM connection error: %s", exc)
        yield {"type": "error", "message": "LLM connection error"}
        yield {"type": "done", "answer": "".join(accumulated).strip()}
        return
    except Exception as exc:
        fallback_reason = str(exc)
        fallback = _fallback_answer(question, synthesis, retrieved_chunks)
        accumulated = [fallback]
        yield {"type": "error", "message": fallback_reason}
        yield {"type": "chunk", "content": fallback}

    llm_latency_ms = round((perf_counter() - llm_started_at) * 1000, 2)
    full_answer = "".join(accumulated).strip() or "I do not know."

    log_event(
        logger,
        "response_generated",
        workspace_id=workspace_id,
        query=question,
        llm_latency_ms=llm_latency_ms,
        retrieved_chunk_count=len(retrieved_chunks),
        used_fallback=bool(fallback_reason),
        fallback_reason=fallback_reason,
        streamed=True,
    )

    yield {
        "type": "done",
        "answer": full_answer,
        "llm_latency_ms": llm_latency_ms,
    }


def is_model_loaded() -> bool:
    try:
        from app.embeddings import is_model_loaded as embeddings_ready

        return embeddings_ready()
    except Exception:
        return False
