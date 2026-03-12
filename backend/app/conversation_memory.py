import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.workspace_manager import ensure_workspace_dirs

MAX_MEMORY_MESSAGES = 8


def _conversation_file(workspace_id: str, conversation_id: str) -> Path:
    paths = ensure_workspace_dirs(workspace_id)
    return paths["conversations"] / f"{conversation_id}.json"


def ensure_conversation(
    workspace_id: str,
    conversation_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> str:
    resolved_id = conversation_id or uuid4().hex
    path = _conversation_file(workspace_id, resolved_id)
    if not path.exists():
        path.write_text(
            json.dumps(
                {
                    "conversation_id": resolved_id,
                    "workspace_id": workspace_id,
                    "session_id": session_id,
                    "messages": [],
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    return resolved_id


def append_message(
    workspace_id: str,
    conversation_id: str,
    role: str,
    content: str,
    session_id: Optional[str] = None,
) -> None:
    path = _conversation_file(workspace_id, conversation_id)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["session_id"] = session_id or payload.get("session_id")
    payload["messages"].append(
        {
            "role": role,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    payload["messages"] = payload["messages"][-MAX_MEMORY_MESSAGES:]
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def get_messages(workspace_id: str, conversation_id: Optional[str]) -> List[Dict]:
    if not conversation_id:
        return []
    path = _conversation_file(workspace_id, conversation_id)
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("messages", [])[-MAX_MEMORY_MESSAGES:]
