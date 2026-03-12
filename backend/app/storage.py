from pathlib import Path

from app.config import get_settings

# Future AWS integration:
# When deploying to AWS, set STORAGE_MODE=s3
# and configure AWS credentials via environment variables.
# The storage adapter will automatically route uploads to S3.


def _provider():
    settings = get_settings()
    if settings.storage_mode == "s3":
        from app import storage_s3 as provider
    else:
        from app import storage_local as provider
    return provider


def get_storage_mode() -> str:
    return get_settings().storage_mode


def upload_document_bytes(workspace_id: str, document_id: str, document_name: str, content: bytes) -> str:
    return _provider().upload_file(workspace_id, document_id, document_name, content)


def download_document_to_path(storage_location: str, destination: Path) -> None:
    _provider().download_file(storage_location, destination)


def delete_document_object(storage_location: str) -> None:
    _provider().delete_file(storage_location)


def check_storage_connection() -> bool:
    return _provider().storage_ready()
