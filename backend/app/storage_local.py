from pathlib import Path

from app.workspace_manager import ensure_workspace_dirs


def upload_file(workspace_id: str, document_id: str, document_name: str, content: bytes) -> str:
    destination = ensure_workspace_dirs(workspace_id)["documents"] / f"{document_id}_{document_name}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return str(destination)


def download_file(storage_location: str, destination: Path) -> None:
    source_path = Path(storage_location)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(source_path.read_bytes())


def delete_file(storage_location: str) -> None:
    source_path = Path(storage_location)
    if source_path.exists():
        source_path.unlink()


def storage_ready() -> bool:
    return True
