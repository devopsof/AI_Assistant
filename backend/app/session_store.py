import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

from app.config import get_settings
from app.database_sqlite import get_db_connection, j, js, with_lock


def _migrate_from_json() -> None:
    try:
        settings = get_settings()
        root = settings.workspaces_root
        conn = get_db_connection()
        with with_lock():
            count = conn.execute("SELECT COUNT(1) FROM sessions").fetchone()[0]
            if count:
                return
            for path in root.glob("*/sessions.json"):
                try:
                    sessions = json.loads(path.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    continue
                for session_id, item in sessions.items():
                    conn.execute(
                        "INSERT OR IGNORE INTO sessions "
                        "(session_id, workspace_id, queries, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (
                            session_id,
                            item.get("workspace_id") or path.parent.name,
                            js(item.get("queries", [])),
                            item.get("created_at"),
                            item.get("updated_at"),
                        ),
                    )
                path.rename(path.with_name(path.name + ".migrated"))
            conn.commit()
    except Exception:
        return


_migrate_from_json()


def ensure_session(workspace_id: str, session_id: Optional[str] = None) -> str:
    conn = get_db_connection()
    resolved_id = session_id or uuid4().hex
    with with_lock():
        row = conn.execute(
            "SELECT session_id FROM sessions WHERE session_id = ?",
            (resolved_id,),
        ).fetchone()
        if not row:
            conn.execute(
                "INSERT INTO sessions (session_id, workspace_id, queries, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    resolved_id,
                    workspace_id,
                    js([]),
                    datetime.now(timezone.utc).isoformat(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
    return resolved_id


def record_session_query(workspace_id: str, session_id: str, question: str) -> None:
    conn = get_db_connection()
    with with_lock():
        row = conn.execute(
            "SELECT queries FROM sessions WHERE session_id = ?",
            (session_id,),
        ).fetchone()
        if row:
            queries = j(row["queries"])
        else:
            queries = []
            conn.execute(
                "INSERT INTO sessions (session_id, workspace_id, queries, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    session_id,
                    workspace_id,
                    js([]),
                    datetime.now(timezone.utc).isoformat(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
        queries.append({"question": question, "timestamp": datetime.now(timezone.utc).isoformat()})
        conn.execute(
            "UPDATE sessions SET queries = ?, updated_at = ? WHERE session_id = ?",
            (js(queries), datetime.now(timezone.utc).isoformat(), session_id),
        )
        conn.commit()
