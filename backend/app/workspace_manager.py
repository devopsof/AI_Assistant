import json
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

from app.config import get_settings


def _load_workspaces() -> List[Dict]:
    settings = get_settings()
    try:
        return json.loads(settings.workspaces_index_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def _save_workspaces(workspaces: List[Dict]) -> None:
    settings = get_settings()
    settings.workspaces_index_path.write_text(
        json.dumps(workspaces, indent=2),
        encoding="utf-8",
    )


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
    if not paths["documents_index"].exists():
        paths["documents_index"].write_text("[]", encoding="utf-8")
    if not paths["collections_index"].exists():
        paths["collections_index"].write_text("[]", encoding="utf-8")
    if not paths["sessions"].exists():
        paths["sessions"].write_text("{}", encoding="utf-8")
    return paths


def create_workspace(workspace_name: str) -> Dict:
    workspaces = _load_workspaces()
    workspace = {
        "workspace_id": f"workspace_{uuid4().hex[:8]}",
        "workspace_name": workspace_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    workspaces.append(workspace)
    _save_workspaces(workspaces)
    ensure_workspace_dirs(workspace["workspace_id"])
    return workspace


def list_workspaces() -> List[Dict]:
    return _load_workspaces()


def find_workspace(workspace_id: str) -> Optional[Dict]:
    return next((workspace for workspace in _load_workspaces() if workspace["workspace_id"] == workspace_id), None)


def delete_workspace(workspace_id: str) -> None:
    workspaces = [workspace for workspace in _load_workspaces() if workspace["workspace_id"] != workspace_id]
    _save_workspaces(workspaces)
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
