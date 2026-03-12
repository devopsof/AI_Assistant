import chromadb
from chromadb.api import ClientAPI

from app.config import get_settings
from app.workspace_manager import ensure_workspace_dirs


def get_chroma_client(workspace_id: str) -> ClientAPI:
    settings = get_settings()
    if settings.chroma_host:
        return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)
    paths = ensure_workspace_dirs(workspace_id)
    return chromadb.PersistentClient(path=str(paths["vectordb"]))


def check_vector_db_connection(workspace_id: str) -> bool:
    try:
        client = get_chroma_client(workspace_id)
        client.heartbeat()
        return True
    except Exception:
        return False
