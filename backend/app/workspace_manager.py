import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import get_settings
from app.database_sqlite import get_db_connection, with_lock


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        json_path = settings.workspaces_index_path
        if not json_path.exists():
            return
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM workspaces").fetchone()[0]
            if count:
                return
            try:
                workspaces = json.loads(json_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                return
            for item in workspaces:
                conn.execute(
                    "INSERT OR IGNORE INTO workspaces (workspace_id, workspace_name, created_at) VALUES (?, ?, ?)",
                    (
                        item.get("workspace_id"),
                        item.get("workspace_name"),
                        item.get("created_at"),
                    ),
                )
            conn.commit()
            json_path.rename(json_path.with_name(json_path.name + ".migrated"))
    except Exception:
        return


_migrate_from_json()


def get_workspace_paths(workspace_id: str) -> Dict[str, Path]:
    settings = get_settings()
    root = settings.workspaces_root / workspace_id
    documents = root / "documents"
    vectordb = root / "vectordb"
    conversations = root / "conversations"
    paths = {
        "root": root,
        "documents": documents,
        "vectordb": vectordb,
        "conversations": conversations,
        "documents_index": root / "documents_index.json",
        "collections_index": root / "collections.json",
        "sessions": root / "sessions.json",
    }
    return paths


def ensure_workspace_dirs(workspace_id: str) -> Dict[str, Path]:
    paths = get_workspace_paths(workspace_id)
    for key in ("root", "documents", "vectordb", "conversations"):
        paths[key].mkdir(parents=True, exist_ok=True)
    return paths


def create_workspace(workspace_name: str) -> Dict:
    workspace = {
        "workspace_id": f"workspace_{uuid4().hex[:8]}",
        "workspace_name": workspace_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    conn = get_db_connection()
    with with_lock():
        conn.execute(
            "INSERT INTO workspaces (workspace_id, workspace_name, created_at) VALUES (?, ?, ?)",
            (workspace["workspace_id"], workspace["workspace_name"], workspace["created_at"]),
        )
        conn.commit()
    ensure_workspace_dirs(workspace["workspace_id"])
    return workspace


def list_workspaces() -> List[Dict]:
    conn = get_db_connection()
    rows = conn.execute("SELECT workspace_id, workspace_name, created_at FROM workspaces").fetchall()
    return [dict(row) for row in rows]


def find_workspace(workspace_id: str) -> Optional[Dict]:
    conn = get_db_connection()
    row = conn.execute(
        "SELECT workspace_id, workspace_name, created_at FROM workspaces WHERE workspace_id = ?",
        (workspace_id,),
    ).fetchone()
    return dict(row) if row else None


def delete_workspace(workspace_id: str) -> None:
    from app.vector_store import delete_workspace_index

    conn = get_db_connection()
    with with_lock():
        conn.execute("DELETE FROM workspaces WHERE workspace_id = ?", (workspace_id,))
        conn.execute("DELETE FROM collections WHERE workspace_id = ?", (workspace_id,))
        conn.execute("DELETE FROM documents WHERE workspace_id = ?", (workspace_id,))
        conn.execute("DELETE FROM conversations WHERE workspace_id = ?", (workspace_id,))
        conn.execute("DELETE FROM sessions WHERE workspace_id = ?", (workspace_id,))
        conn.commit()
    delete_workspace_index(workspace_id)
    root = get_workspace_paths(workspace_id)["root"]
    if root.exists():
        for attempt in range(3):
            try:
                shutil.rmtree(root)
                return
            except PermissionError:
                if attempt == 2:
                    shutil.rmtree(root, ignore_errors=True)
                    return
                time.sleep(0.15)
