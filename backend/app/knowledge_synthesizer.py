from collections import defaultdict
from time import perf_counter
from typing import Dict, List

from app.document_registry import find_document_record


def group_chunks_by_document(retrieved_chunks: List[Dict]) -> Dict[str, Dict]:
    grouped: Dict[str, Dict] = {}
    for chunk in retrieved_chunks:
        document_id = chunk["document_id"]
        document_group = grouped.setdefault(
            document_id,
            {
                "document_id": document_id,
                "document_name": chunk["document_name"],
                "chunks": [],
            },
        )
        document_group["chunks"].append(chunk)
    return grouped


def detect_themes(workspace_id: str, grouped_chunks: Dict[str, Dict], max_chunks_per_theme: int = 4) -> List[Dict]:
    theme_map: Dict[str, Dict] = defaultdict(
        lambda: {"theme": "", "documents": set(), "chunks": [], "supporting_points": []}
    )

    for document_id, group in grouped_chunks.items():
        record = find_document_record(workspace_id, document_id) or {}
        theme_candidates = (
            record.get("topics", [])
            or record.get("concepts", [])
            or [group["document_name"]]
        )
        for theme in theme_candidates[:3]:
            key = str(theme).strip().lower()
            if not key:
                continue
            entry = theme_map[key]
            entry["theme"] = str(theme).strip()
            entry["documents"].add(group["document_name"])
            for chunk in group["chunks"][:max_chunks_per_theme]:
                if len(entry["chunks"]) >= max_chunks_per_theme:
                    break
                entry["chunks"].append(chunk)
                point = chunk["chunk_text"].strip().replace("\n", " ")
                if point and point not in entry["supporting_points"]:
                    entry["supporting_points"].append(point[:220])

    themes = []
    for item in theme_map.values():
        item["documents"] = sorted(item["documents"])
        item["supporting_points"] = item["supporting_points"][:3]
        themes.append(item)

    themes.sort(key=lambda theme: (len(theme["documents"]), len(theme["chunks"])), reverse=True)
    return themes[:5]


def build_synthesized_context(
    workspace_id: str,
    retrieved_chunks: List[Dict],
    max_documents: int = 5,
    max_chunks_per_theme: int = 3,
) -> Dict:
    started_at = perf_counter()
    grouped_documents = group_chunks_by_document(retrieved_chunks)
    trimmed_documents = dict(list(grouped_documents.items())[:max_documents])
    themes = detect_themes(
        workspace_id,
        trimmed_documents,
        max_chunks_per_theme=max_chunks_per_theme,
    )

    if not themes:
        context = "No synthesized themes available."
    else:
        blocks = []
        for theme in themes:
            key_points = "\n".join(f"- {point}" for point in theme["supporting_points"][:max_chunks_per_theme])
            sources = ", ".join(theme["documents"][:max_documents])
            blocks.append(
                f"Topic: {theme['theme']}\n"
                f"Sources: {sources}\n"
                f"Key Points:\n{key_points}"
            )
        context = "\n\n".join(blocks)

    insights = [
        {
            "theme": theme["theme"],
            "documents": theme["documents"],
            "key_points": theme["supporting_points"][:max_chunks_per_theme],
        }
        for theme in themes
    ]

    synthesis_time_ms = round((perf_counter() - started_at) * 1000, 2)
    return {
        "grouped_documents": trimmed_documents,
        "themes": themes,
        "insights": insights,
        "context": context,
        "documents_used": [group["document_name"] for group in trimmed_documents.values()],
        "synthesis_time_ms": synthesis_time_ms,
    }
