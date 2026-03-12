import json
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from app.workspace_manager import ensure_workspace_dirs

DEFAULT_COLLECTION_NAME = "General"


def _collections_path(workspace_id: str):
    return ensure_workspace_dirs(workspace_id)["collections_index"]


def _load_collections(workspace_id: str) -> List[Dict]:
    try:
        return json.loads(_collections_path(workspace_id).read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def _save_collections(workspace_id: str, collections: List[Dict]) -> None:
    _collections_path(workspace_id).write_text(
        json.dumps(collections, indent=2),
        encoding="utf-8",
    )


def ensure_default_collection(workspace_id: str) -> Dict:
    collections = _load_collections(workspace_id)
    existing = next((item for item in collections if item["collection_name"] == DEFAULT_COLLECTION_NAME), None)
    if existing:
        return existing

    collection = {
        "collection_id": f"collection_{uuid4().hex[:8]}",
        "workspace_id": workspace_id,
        "collection_name": DEFAULT_COLLECTION_NAME,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    collections.append(collection)
    _save_collections(workspace_id, collections)
    return collection


def list_collections(workspace_id: str) -> List[Dict]:
    ensure_default_collection(workspace_id)
    return _load_collections(workspace_id)


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
    collections.append(collection)
    _save_collections(workspace_id, collections)
    return collection


def find_collection(workspace_id: str, collection_id: str | None) -> Optional[Dict]:
    if not collection_id:
        return ensure_default_collection(workspace_id)
    return next(
        (item for item in list_collections(workspace_id) if item["collection_id"] == collection_id),
        None,
    )


def get_collection_name(workspace_id: str, collection_id: str | None) -> str:
    collection = find_collection(workspace_id, collection_id)
    return collection["collection_name"] if collection else DEFAULT_COLLECTION_NAME


def delete_collection(workspace_id: str, collection_id: str) -> bool:
    collections = list_collections(workspace_id)
    collection = next((item for item in collections if item["collection_id"] == collection_id), None)
    if not collection or collection["collection_name"] == DEFAULT_COLLECTION_NAME:
        return False
    remaining = [item for item in collections if item["collection_id"] != collection_id]
    _save_collections(workspace_id, remaining)
    return True
