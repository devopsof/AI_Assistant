import json
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from app.workspace_manager import ensure_workspace_dirs
from app.collection_manager import get_collection_name


def _registry_path(workspace_id: str) -> Path:
    return ensure_workspace_dirs(workspace_id)["documents_index"]


def _load_registry(workspace_id: str) -> List[Dict]:
    path = _registry_path(workspace_id)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def _save_registry(workspace_id: str, records: List[Dict]) -> None:
    _registry_path(workspace_id).write_text(
        json.dumps(records, indent=2),
        encoding="utf-8",
    )


def generate_document_id() -> str:
    return uuid4().hex


def create_document_record(
    workspace_id: str,
    document_id: str,
    file_name: str,
    storage_location: str,
    file_hash: str = "",
    file_size: int = 0,
    conversation_id: str | None = None,
    collection_id: str | None = None,
) -> Dict:
    records = _load_registry(workspace_id)
    record = {
        "document_id": document_id,
        "file_name": file_name,
        "document_name": file_name,
        "storage_location": storage_location,
        "file_hash": file_hash,
        "file_size": file_size,
        "collection_id": collection_id,
        "collection_name": get_collection_name(workspace_id, collection_id),
        "upload_timestamp": datetime.now(timezone.utc).isoformat(),
        "chunk_count": 0,
        "indexed_at": None,
        "summary": "",
        "topics": [],
        "entities": [],
        "concepts": [],
        "important_sections": [],
        "conversation_ids": [conversation_id] if conversation_id else [],
    }
    records.append(record)
    _save_registry(workspace_id, records)
    return record


def remove_document_record(workspace_id: str, document_id: str) -> None:
    records = [record for record in _load_registry(workspace_id) if record["document_id"] != document_id]
    _save_registry(workspace_id, records)


def list_document_records(workspace_id: str, conversation_id: str | None = None) -> List[Dict]:
    records = _load_registry(workspace_id)
    if not conversation_id:
        return records
    return [
        record
        for record in records
        if conversation_id in record.get("conversation_ids", [])
    ]


def find_document_record(workspace_id: str, document_id: str) -> Optional[Dict]:
    return next((record for record in _load_registry(workspace_id) if record["document_id"] == document_id), None)


def find_duplicate_document(workspace_id: str, file_hash: str) -> Optional[Dict]:
    return next((record for record in _load_registry(workspace_id) if record.get("file_hash") == file_hash), None)


def update_document_record(workspace_id: str, document_id: str, **updates: object) -> Optional[Dict]:
    records = _load_registry(workspace_id)
    updated_record: Optional[Dict] = None
    for record in records:
        if record["document_id"] == document_id:
            record.update(updates)
            updated_record = record
            break
    _save_registry(workspace_id, records)
    return updated_record


def attach_document_to_conversation(
    workspace_id: str,
    document_id: str,
    conversation_id: str | None,
) -> Optional[Dict]:
    if not conversation_id:
        return find_document_record(workspace_id, document_id)

    record = find_document_record(workspace_id, document_id)
    if not record:
        return None

    conversation_ids = list(record.get("conversation_ids", []))
    if conversation_id not in conversation_ids:
        conversation_ids.append(conversation_id)
    return update_document_record(
        workspace_id,
        document_id,
        conversation_ids=conversation_ids,
    )


def get_document_set_hash(
    workspace_id: str,
    conversation_id: str | None = None,
    document_ids: List[str] | None = None,
) -> str:
    records = sorted(
        [
            record
            for record in _load_registry(workspace_id)
            if (not conversation_id or conversation_id in record.get("conversation_ids", []))
            and (not document_ids or record.get("document_id") in document_ids)
        ],
        key=lambda item: item.get("document_id", ""),
    )
    digest_source = [
        {
            "document_id": record.get("document_id"),
            "indexed_at": record.get("indexed_at"),
            "chunk_count": record.get("chunk_count", 0),
        }
        for record in records
    ]
    return sha256(json.dumps(digest_source, sort_keys=True).encode("utf-8")).hexdigest()


def get_conversation_document_ids(workspace_id: str, conversation_id: str | None) -> List[str]:
    if not conversation_id:
        return []
    return [
        record["document_id"]
        for record in list_document_records(workspace_id, conversation_id)
    ]


def get_document_text(workspace_id: str, document_id: str) -> str:
    record = find_document_record(workspace_id, document_id)
    if not record:
        return ""
    location = record.get("storage_location", record.get("stored_path", ""))
    if not location or location.startswith("s3://"):
        return ""
    path = Path(location)
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="ignore")
