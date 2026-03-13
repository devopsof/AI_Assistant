import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import get_settings
from app.database_sqlite import get_db_connection, j, js, with_lock

MAX_MEMORY_MESSAGES = 8


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        root = settings.workspaces_root
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM conversations").fetchone()[0]
            if count:
                return
            for path in root.glob("*/conversations/*.json"):
                try:
                    payload = json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    continue
                conn.execute(
                    "INSERT OR IGNORE INTO conversations "
                    "(conversation_id, workspace_id, session_id, messages, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        payload.get("conversation_id"),
                        payload.get("workspace_id") or path.parent.parent.name,
                        payload.get("session_id"),
                        js(payload.get("messages", [])),
                        payload.get("created_at"),
                        payload.get("updated_at"),
                    ),
                )
                path.rename(path.with_name(path.name + ".migrated"))
            conn.commit()
    except Exception:
        return


_migrate_from_json()


def ensure_conversation(
    workspace_id: str,
    conversation_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> str:
    resolved_id = conversation_id or uuid4().hex
    conn = get_db_connection()
    with with_lock():
        row = conn.execute(
            "SELECT conversation_id FROM conversations WHERE conversation_id = ?",
            (resolved_id,),
        ).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO conversations (conversation_id, workspace_id, session_id, messages, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    resolved_id,
                    workspace_id,
                    session_id,
                    js([]),
                    datetime.now(timezone.utc).isoformat(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
    return resolved_id


def append_message(
    workspace_id: str,
    conversation_id: str,
    role: str,
    content: str,
    session_id: Optional[str] = None,
) -> None:
    conn = get_db_connection()
    with with_lock():
        row = conn.execute(
            "SELECT messages FROM conversations WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchone()
        messages = j(row["messages"]) if row else []
        messages.append(
            {
                "role": role,
                "content": content,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        messages = messages[-MAX_MEMORY_MESSAGES:]
        conn.execute(
            "UPDATE conversations SET messages = ?, session_id = ?, updated_at = ? WHERE conversation_id = ?",
            (
                js(messages),
                session_id,
                datetime.now(timezone.utc).isoformat(),
                conversation_id,
            ),
        )
        conn.commit()


def get_messages(workspace_id: str, conversation_id: Optional[str]) -> List[Dict]:
    if not conversation_id:
        return []
    conn = get_db_connection()
    row = conn.execute(
        "SELECT messages FROM conversations WHERE conversation_id = ?",
        (conversation_id,),
    ).fetchone()
    return j(row["messages"]) if row else []


def list_conversations(workspace_id: str) -> List[Dict]:
    conn = get_db_connection()
    rows = conn.execute(
        "SELECT conversation_id, session_id, created_at, updated_at "
        "FROM conversations WHERE workspace_id = ?",
        (workspace_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_conversation_messages(workspace_id: str, conversation_id: str) -> List[Dict]:
    return get_messages(workspace_id, conversation_id)
