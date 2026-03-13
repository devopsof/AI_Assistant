import json
import sqlite3
import threading
from pathlib import Path

from app.config import get_settings

_lock = threading.Lock()
_conn = None


def get_db_connection() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        db_path = Path(get_settings().data_dir) / "knowledge_assistant.db"
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(db_path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
        _init_schema(_conn)
    return _conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS workspaces (
            workspace_id TEXT PRIMARY KEY,
            workspace_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS collections (
            collection_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            collection_name TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
            document_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            document_name TEXT NOT NULL,
            storage_location TEXT,
            file_hash TEXT,
            file_size INTEGER DEFAULT 0,
            collection_id TEXT,
            collection_name TEXT,
            upload_timestamp TEXT NOT NULL,
            chunk_count INTEGER DEFAULT 0,
            indexed_at TEXT,
            summary TEXT DEFAULT '',
            topics TEXT DEFAULT '[]',
            entities TEXT DEFAULT '[]',
            concepts TEXT DEFAULT '[]',
            important_sections TEXT DEFAULT '[]',
            conversation_ids TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS conversations (
            conversation_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            session_id TEXT,
            messages TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            queries TEXT DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            progress INTEGER DEFAULT 0,
            message TEXT,
            result TEXT DEFAULT '{}',
            updated_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def j(val):
    if val is None:
        return []
    try:
        return json.loads(val)
    except Exception:
        return []


def js(val) -> str:
    return json.dumps(val)


def with_lock():
    return _lock
