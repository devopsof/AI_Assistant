import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import get_settings
from app.database_sqlite import get_db_connection, with_lock
from app.workspace_manager import ensure_workspace_dirs

DEFAULT_COLLECTION_NAME = "General"


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        root = settings.workspaces_root
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM collections").fetchone()[0]
            if count:
                return
            for path in root.glob("*/collections.json"):
                try:
                    records = json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    continue
                for item in records:
                    conn.execute(
                        "INSERT OR IGNORE INTO collections (collection_id, workspace_id, collection_name, created_at) "
                        "VALUES (?, ?, ?, ?)",
                        (
                            item.get("collection_id"),
                            item.get("workspace_id"),
                            item.get("collection_name"),
                            item.get("created_at"),
                        ),
                    )
                path.rename(path.with_name(path.name + ".migrated"))
            conn.commit()
    except Exception:
        return


_migrate_from_json()


def ensure_default_collection(workspace_id: str) -> Dict:
    conn = get_db_connection()
    with with_lock():
        row = conn.execute(
            "SELECT collection_id, workspace_id, collection_name, created_at "
            "FROM collections WHERE workspace_id = ? AND collection_name = ?",
            (workspace_id, DEFAULT_COLLECTION_NAME),
        ).fetchone()
        if row:
            return dict(row)
        collection = {
            "collection_id": f"collection_{uuid4().hex[:8]}",
            "workspace_id": workspace_id,
            "collection_name": DEFAULT_COLLECTION_NAME,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        conn.execute(
            "INSERT INTO collections (collection_id, workspace_id, collection_name, created_at) VALUES (?, ?, ?, ?)",
            (
                collection["collection_id"],
                collection["workspace_id"],
                collection["collection_name"],
                collection["created_at"],
            ),
        )
        conn.commit()
    ensure_workspace_dirs(workspace_id)
    return collection


def list_collections(workspace_id: str) -> List[Dict]:
    ensure_default_collection(workspace_id)
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT collection_id, workspace_id, collection_name, created_at FROM collections WHERE workspace_id = ?",
        (workspace_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def create_collection(workspace_id: str, collection_name: str) -> Dict:
    collection_name = collection_name.strip()
    collections = list_collections(workspace_id)
    existing = next(
        (item for item in collections if item["collection_name"].lower() == collection_name.lower()),
        None,
    )
    if existing:
        return existing

    collection = {
        "collection_id": f"collection_{uuid4().hex[:8]}",
        "workspace_id": workspace_id,
        "collection_name": collection_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "INSERT INTO collections (collection_id, workspace_id, collection_name, created_at) VALUES (?, ?, ?, ?)",
            (
                collection["collection_id"],
                collection["workspace_id"],
                collection["collection_name"],
                collection["created_at"],
            ),
        )
        conn.commit()
    return collection


def find_collection(workspace_id: str, collection_id: str | None) -> Optional[Dict]:
    if not collection_id:
        return ensure_default_collection(workspace_id)
    conn = get_db_connection()
    row = conn.execute(
        "SELECT collection_id, workspace_id, collection_name, created_at FROM collections WHERE collection_id = ?",
        (collection_id,),
    ).fetchone()
    return dict(row) if row else None


def get_collection_name(workspace_id: str, collection_id: str | None) -> str:
    collection = find_collection(workspace_id, collection_id)
    return collection["collection_name"] if collection else DEFAULT_COLLECTION_NAME


def delete_collection(workspace_id: str, collection_id: str) -> bool:
    collection = find_collection(workspace_id, collection_id)
    if not collection or collection["collection_name"] == DEFAULT_COLLECTION_NAME:
        return False
    conn = get_db_connection()
    with with_lock():
        conn.execute("DELETE FROM collections WHERE collection_id = ?", (collection_id,))
        conn.commit()
    return True
