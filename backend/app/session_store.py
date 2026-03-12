import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

from app.workspace_manager import ensure_workspace_dirs


def _session_path(workspace_id: str) -> Path:
    return ensure_workspace_dirs(workspace_id)["sessions"]


def _load_sessions(workspace_id: str) -> Dict[str, Dict]:
    path = _session_path(workspace_id)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _save_sessions(workspace_id: str, sessions: Dict[str, Dict]) -> None:
    _session_path(workspace_id).write_text(json.dumps(sessions, indent=2), encoding="utf-8")


def ensure_session(workspace_id: str, session_id: Optional[str] = None) -> str:
    sessions = _load_sessions(workspace_id)
    resolved_id = session_id or uuid4().hex
    if resolved_id not in sessions:
        sessions[resolved_id] = {
            "session_id": resolved_id,
            "queries": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_sessions(workspace_id, sessions)
    return resolved_id


def record_session_query(workspace_id: str, session_id: str, question: str) -> None:
    sessions = _load_sessions(workspace_id)
    session = sessions.setdefault(
        session_id,
        {
            "session_id": session_id,
            "queries": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    session["queries"].append(
        {"question": question, "timestamp": datetime.now(timezone.utc).isoformat()}
    )
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_sessions(workspace_id, sessions)
