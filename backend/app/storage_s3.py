from pathlib import Path

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings


def get_s3_client():
    settings = get_settings()
    session = boto3.session.Session()
    client_kwargs = {
        "service_name": "s3",
        "region_name": settings.aws_region,
        "aws_access_key_id": settings.s3_access_key_id or None,
        "aws_secret_access_key": settings.s3_secret_access_key or None,
        "config": Config(s3={"addressing_style": "path"}),
    }
    if settings.s3_endpoint_url:
        client_kwargs["endpoint_url"] = settings.s3_endpoint_url
    return session.client(**client_kwargs)


def ensure_bucket_exists() -> None:
    settings = get_settings()
    client = get_s3_client()
    try:
        client.head_bucket(Bucket=settings.s3_bucket_name)
    except ClientError:
        create_kwargs = {"Bucket": settings.s3_bucket_name}
        if settings.aws_region != "us-east-1" and not settings.s3_endpoint_url:
            create_kwargs["CreateBucketConfiguration"] = {
                "LocationConstraint": settings.aws_region
            }
        client.create_bucket(**create_kwargs)


def build_s3_key(document_id: str, document_name: str) -> str:
    return f"documents/{document_id}/{document_name}"


def upload_file(workspace_id: str, document_id: str, document_name: str, content: bytes) -> str:
    settings = get_settings()
    ensure_bucket_exists()
    key = f"workspaces/{workspace_id}/{build_s3_key(document_id, document_name)}"
    client = get_s3_client()
    client.put_object(Bucket=settings.s3_bucket_name, Key=key, Body=content)
    return f"s3://{settings.s3_bucket_name}/{key}"


def download_file(storage_location: str, destination: Path) -> None:
    settings = get_settings()
    client = get_s3_client()
    prefix = f"s3://{settings.s3_bucket_name}/"
    key = storage_location.replace(prefix, "", 1)
    destination.parent.mkdir(parents=True, exist_ok=True)
    client.download_file(settings.s3_bucket_name, key, str(destination))


def delete_file(storage_location: str) -> None:
    settings = get_settings()
    client = get_s3_client()
    prefix = f"s3://{settings.s3_bucket_name}/"
    key = storage_location.replace(prefix, "", 1)
    client.delete_object(Bucket=settings.s3_bucket_name, Key=key)


def storage_ready() -> bool:
    try:
        ensure_bucket_exists()
        return True
    except (BotoCoreError, ClientError):
        return False
