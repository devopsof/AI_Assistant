from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "CORS_ORIGINS"),
    )
    jwt_secret_key: str = Field(default="CHANGE_ME_IN_PRODUCTION", alias="JWT_SECRET_KEY")
    auth_enabled: bool = Field(default=True, alias="AUTH_ENABLED")
    storage_mode: str = Field(default="local", alias="STORAGE_MODE")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    groq_base_url: str = Field(default="https://api.groq.com/openai/v1", alias="GROQ_BASE_URL")
    embedding_model_name: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="EMBEDDING_MODEL_NAME",
    )
    model_name: str = Field(
        default="sentence-transformers/all-MiniLM-L6-v2",
        alias="MODEL_NAME",
    )
    groq_chat_model: str = Field(default="llama-3.1-8b-instant", alias="GROQ_CHAT_MODEL")
    chroma_collection_name: str = Field(default="knowledge_base")
    chroma_host: str = Field(default="", alias="CHROMA_HOST")
    chroma_port: int = Field(default=8001, alias="CHROMA_PORT")
    data_dir: Path = Path(__file__).resolve().parents[1] / "data"
    workspaces_root: Path = Path(__file__).resolve().parents[1] / "data" / "workspaces"
    workspaces_index_path: Path = Path(__file__).resolve().parents[1] / "data" / "workspaces.json"
    users_index_path: Path = Path(__file__).resolve().parents[1] / "data" / "users.json"
    aws_region: str = Field(default="us-east-1", alias="AWS_REGION")
    s3_bucket_name: str = Field(default="", alias="S3_BUCKET")
    s3_endpoint_url: str = Field(default="", alias="S3_ENDPOINT_URL")
    s3_access_key_id: str = Field(default="", alias="AWS_ACCESS_KEY_ID")
    s3_secret_access_key: str = Field(default="", alias="AWS_SECRET_ACCESS_KEY")
    chunk_size_tokens: int = Field(default=500, alias="CHUNK_SIZE")
    chunk_overlap_tokens: int = Field(default=100, alias="CHUNK_OVERLAP")
    top_k_results: int = Field(default=5, alias="TOP_K")
    max_upload_mb: int = Field(default=20, alias="MAX_UPLOAD_MB")
    rate_limit_enabled: bool = Field(default=True, alias="RATE_LIMIT_ENABLED")
    redis_url: str = Field(default="", alias="REDIS_URL")
    app_env: str = Field(default="development", alias="APP_ENV")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        populate_by_name=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_mode = settings.storage_mode.lower().strip()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.workspaces_root.mkdir(parents=True, exist_ok=True)
    if not settings.workspaces_index_path.exists():
        settings.workspaces_index_path.write_text("[]", encoding="utf-8")
    if not settings.users_index_path.exists():
        settings.users_index_path.write_text("[]", encoding="utf-8")
    return settings
