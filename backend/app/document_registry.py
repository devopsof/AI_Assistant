import json
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import get_settings
from app.collection_manager import get_collection_name
from app.database_sqlite import get_db_connection, j, js, with_lock
from app.workspace_manager import ensure_workspace_dirs


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        root = settings.workspaces_root
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM documents").fetchone()[0]
            if count:
                return
            for path in root.glob("*/documents_index.json"):
                try:
                    records = json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    continue
                for item in records:
                    conn.execute(
                        "INSERT OR IGNORE INTO documents "
                        "(document_id, workspace_id, file_name, document_name, storage_location, file_hash, "
                        "file_size, collection_id, collection_name, upload_timestamp, chunk_count, indexed_at, "
                        "summary, topics, entities, concepts, important_sections, conversation_ids) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            item.get("document_id"),
                            item.get("workspace_id") or path.parent.name,
                            item.get("file_name"),
                            item.get("document_name"),
                            item.get("storage_location"),
                            item.get("file_hash"),
                            item.get("file_size", 0),
                            item.get("collection_id"),
                            item.get("collection_name"),
                            item.get("upload_timestamp"),
                            item.get("chunk_count", 0),
                            item.get("indexed_at"),
                            item.get("summary", ""),
                            js(item.get("topics", [])),
                            js(item.get("entities", [])),
                            js(item.get("concepts", [])),
                            js(item.get("important_sections", [])),
                            js(item.get("conversation_ids", [])),
                        ),
                    )
                path.rename(path.with_name(path.name + ".migrated"))
            conn.commit()
    except Exception:
        return


_migrate_from_json()


def generate_document_id() -> str:
    return uuid4().hex


def _row_to_record(row: Dict) -> Dict:
    return {
        "document_id": row["document_id"],
        "workspace_id": row["workspace_id"],
        "file_name": row["file_name"],
        "document_name": row["document_name"],
        "storage_location": row["storage_location"],
        "file_hash": row["file_hash"],
        "file_size": row["file_size"],
        "collection_id": row["collection_id"],
        "collection_name": row["collection_name"],
        "upload_timestamp": row["upload_timestamp"],
        "chunk_count": row["chunk_count"],
        "indexed_at": row["indexed_at"],
        "summary": row["summary"],
        "topics": j(row["topics"]),
        "entities": j(row["entities"]),
        "concepts": j(row["concepts"]),
        "important_sections": j(row["important_sections"]),
        "conversation_ids": j(row["conversation_ids"]),
    }


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
    record = {
        "document_id": document_id,
        "workspace_id": workspace_id,
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
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "INSERT INTO documents "
            "(document_id, workspace_id, file_name, document_name, storage_location, file_hash, file_size, "
            "collection_id, collection_name, upload_timestamp, chunk_count, indexed_at, summary, topics, "
            "entities, concepts, important_sections, conversation_ids) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record["document_id"],
                record["workspace_id"],
                record["file_name"],
                record["document_name"],
                record["storage_location"],
                record["file_hash"],
                record["file_size"],
                record["collection_id"],
                record["collection_name"],
                record["upload_timestamp"],
                record["chunk_count"],
                record["indexed_at"],
                record["summary"],
                js(record["topics"]),
                js(record["entities"]),
                js(record["concepts"]),
                js(record["important_sections"]),
                js(record["conversation_ids"]),
            ),
        )
        conn.commit()
    ensure_workspace_dirs(workspace_id)
    return record


def remove_document_record(workspace_id: str, document_id: str) -> None:
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "DELETE FROM documents WHERE workspace_id = ? AND document_id = ?",
            (workspace_id, document_id),
        )
        conn.commit()


def list_document_records(workspace_id: str, conversation_id: str | None = None) -> List[Dict]:
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT * FROM documents WHERE workspace_id = ?",
        (workspace_id,),
    ).fetchall()
    records = [_row_to_record(dict(row)) for row in rows]
    if not conversation_id:
        return records
    return [
        record
        for record in records
        if conversation_id in record.get("conversation_ids", [])
    ]


def find_document_record(workspace_id: str, document_id: str) -> Optional[Dict]:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM documents WHERE workspace_id = ? AND document_id = ?",
        (workspace_id, document_id),
    ).fetchone()
    return _row_to_record(dict(row)) if row else None


def find_duplicate_document(workspace_id: str, file_hash: str) -> Optional[Dict]:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT * FROM documents WHERE workspace_id = ? AND file_hash = ?",
        (workspace_id, file_hash),
    ).fetchone()
    return _row_to_record(dict(row)) if row else None


def update_document_record(workspace_id: str, document_id: str, **updates: object) -> Optional[Dict]:
    if not updates:
        return find_document_record(workspace_id, document_id)
    fields = []
    values = []
    for key, value in updates.items():
        if key in {"topics", "entities", "concepts", "important_sections", "conversation_ids"}:
            value = js(value)
        fields.append(f"{key} = ?")
        values.append(value)
    values.extend([workspace_id, document_id])
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            f"UPDATE documents SET {', '.join(fields)} WHERE workspace_id = ? AND document_id = ?",
            tuple(values),
        )
        conn.commit()
    return find_document_record(workspace_id, document_id)


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
            for record in list_document_records(workspace_id, conversation_id)
            if (not document_ids or record.get("document_id") in document_ids)
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
