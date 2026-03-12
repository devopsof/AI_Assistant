from typing import List

from app.document_registry import list_document_records


def select_relevant_documents(
    workspace_id: str,
    query: str,
    limit: int = 5,
    allowed_document_ids: List[str] | None = None,
) -> List[str]:
    tokens = {token.lower() for token in query.split() if token}
    if not tokens:
        return []

    ranked = []
    allowed = set(allowed_document_ids or [])
    for record in list_document_records(workspace_id):
        if allowed and record["document_id"] not in allowed:
            continue
        searchable_fields = [
            record.get("file_name", "").lower(),
            record.get("summary", "").lower(),
            " ".join(record.get("topics", [])).lower(),
            " ".join(record.get("entities", [])).lower(),
            " ".join(record.get("concepts", [])).lower(),
        ]
        score = 0
        for token in tokens:
            if token in searchable_fields[0]:
                score += 3
            score += sum(1 for field in searchable_fields[1:] if token in field)
        if score > 0:
            ranked.append((score, record["document_id"]))

    ranked.sort(reverse=True)
    return [document_id for _, document_id in ranked[:limit]]


def detect_relevant_collections(workspace_id: str, query: str, limit: int = 3) -> List[str]:
    tokens = {token.lower() for token in query.split() if token}
    if not tokens:
        return []

    collection_scores = {}
    for record in list_document_records(workspace_id):
        collection_id = record.get("collection_id")
        if not collection_id:
            continue
        searchable = " ".join(
            [
                record.get("collection_name", ""),
                record.get("file_name", ""),
                record.get("summary", ""),
                " ".join(record.get("topics", [])),
                " ".join(record.get("entities", [])),
                " ".join(record.get("concepts", [])),
            ]
        ).lower()
        score = collection_scores.get(collection_id, 0)
        for token in tokens:
            if token in record.get("collection_name", "").lower():
                score += 4
            elif token in searchable:
                score += 1
        collection_scores[collection_id] = score

    ranked = [(score, collection_id) for collection_id, score in collection_scores.items() if score > 0]
    ranked.sort(reverse=True)
    return [collection_id for _, collection_id in ranked[:limit]]
