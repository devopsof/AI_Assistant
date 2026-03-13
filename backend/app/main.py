from datetime import datetime, timezone
from hashlib import sha256
from html import unescape
from pathlib import Path
from tempfile import TemporaryDirectory
from time import perf_counter
from collections import Counter
from uuid import uuid4

import httpx
from bs4 import BeautifulSoup
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi import BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.auth import get_current_user, login_user, signup_user
from app.collection_manager import create_collection, delete_collection, find_collection, list_collections
from app.config import get_settings
from app.document_graph_builder import build_document_graph
from app.document_intelligence import analyze_document_text
from app.database import check_vector_db_connection
from app.document_processor import SUPPORTED_EXTENSIONS, prepare_document
from app.conversation_memory import ensure_conversation
from app.document_registry import (
    attach_document_to_conversation,
    create_document_record,
    find_document_record,
    find_duplicate_document,
    get_conversation_document_ids,
    generate_document_id,
    get_document_text,
    list_document_records,
    remove_document_record,
    update_document_record,
)
from app.embeddings import generate_embedding, is_model_loaded
from app.hybrid_retrieval import hybrid_search
from app.keyword_index import clear_keyword_index_cache
from app.knowledge_graph_builder import build_knowledge_graph
from app.logging_utils import get_logger, log_event
from app.job_store import create_job, get_job, update_job
from app.models import (
    AuthRequest,
    AuthResponse,
    CollectionCreateRequest,
    CollectionDeleteResponse,
    CollectionListResponse,
    CollectionSummary,
    DeleteDocumentResponse,
    DocumentIntelligenceResponse,
    DocumentListResponse,
    DocumentPreviewResponse,
    DocumentSummary,
    MoveDocumentRequest,
    HealthResponse,
    KnowledgeGraphResponse,
    QueryRequest,
    QueryResponse,
    ReindexRequest,
    ReindexResponse,
    SearchResponse,
    UploadResponse,
    UrlIngestRequest,
    WorkspaceOverviewResponse,
    WorkspaceCreateRequest,
    WorkspaceDeleteResponse,
    WorkspaceListResponse,
    WorkspaceSummary,
)
from app.query_cache import clear_cached_results
from app.query_service import answer_question, format_search_results, stream_answer_events
from app.storage import (
    check_storage_connection,
    delete_document_object,
    download_document_to_path,
    get_storage_mode,
    upload_document_bytes,
)
from app.vector_store import delete_document_embeddings, delete_workspace_index, store_embeddings
from app.workspace_manager import create_workspace, delete_workspace, find_workspace, list_workspaces

app = FastAPI(title="AI Knowledge Assistant")
settings = get_settings()
logger = get_logger("api")
limiter = Limiter(key_func=get_remote_address, enabled=settings.rate_limit_enabled)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _workspace_or_404(workspace_id: str) -> dict:
    workspace = find_workspace(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return workspace


def _clean_web_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        tag.decompose()
    return unescape(soup.get_text(separator="\n", strip=True))


@app.on_event("startup")
def startup_event() -> None:
    storage_mode = get_storage_mode()
    storage_ready = check_storage_connection()
    model_ready = is_model_loaded()

    log_event(
        logger,
        "startup_complete",
        model_name=settings.model_name or settings.embedding_model_name,
        top_k=settings.top_k_results,
        chunk_size=settings.chunk_size_tokens,
        chunk_overlap=settings.chunk_overlap_tokens,
        storage_mode=storage_mode,
        storage_path=str(settings.workspaces_root),
        storage_ready=storage_ready,
        model_ready=model_ready,
    )
    if not storage_ready:
        raise RuntimeError("Storage backend is not ready.")
    if not model_ready:
        raise RuntimeError("Embedding model failed to load.")


def _index_document(
    workspace_id: str,
    document_id: str,
    original_name: str,
    upload_timestamp: str,
    temp_path: Path,
) -> int:
    processing_started_at = perf_counter()
    cleaned_text, chunks = prepare_document(temp_path)
    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="No readable text was found in the uploaded document.",
        )

    intelligence = analyze_document_text(cleaned_text)
    update_document_record(
        workspace_id,
        document_id,
        summary=intelligence["summary"],
        topics=intelligence["topics"],
        entities=intelligence["entities"],
        concepts=intelligence["concepts"],
        important_sections=intelligence["important_sections"],
    )

    embeddings_started_at = perf_counter()
    embeddings = [generate_embedding(chunk) for chunk in chunks]
    embedding_generation_ms = round((perf_counter() - embeddings_started_at) * 1000, 2)
    stored_count = store_embeddings(
        workspace_id,
        document_id,
        original_name,
        upload_timestamp,
        chunks,
        embeddings,
    )

    indexed_at = datetime.now(timezone.utc).isoformat()
    updated_record = update_document_record(
        workspace_id,
        document_id,
        chunk_count=stored_count,
        indexed_at=indexed_at,
    )

    log_event(
        logger,
        "document_indexed",
        workspace_id=workspace_id,
        document_id=document_id,
        document_name=original_name,
        chunk_count=stored_count,
        processing_latency_ms=round((perf_counter() - processing_started_at) * 1000, 2),
        embedding_generation_ms=embedding_generation_ms,
        summary=intelligence["summary"],
        topics=intelligence["topics"],
        entities=intelligence["entities"],
        indexed_at=updated_record["indexed_at"] if updated_record else indexed_at,
    )
    return stored_count


def _ingest_document_bytes(
    workspace_id: str,
    *,
    document_id: str,
    original_name: str,
    file_bytes: bytes,
    conversation_id: str | None,
    collection_id: str | None,
    user_id: str,
    job_id: str,
) -> UploadResponse:
    max_upload_bytes = settings.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_upload_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_mb}MB limit.")

    upload_started_at = perf_counter()
    resolved_conversation_id = (
        ensure_conversation(workspace_id, conversation_id) if conversation_id else None
    )
    resolved_collection = find_collection(workspace_id, collection_id)
    update_job(job_id, "uploading", 10, "Uploading document...")

    file_hash = sha256(file_bytes).hexdigest()
    duplicate = find_duplicate_document(workspace_id, file_hash)
    if duplicate:
        attach_document_to_conversation(
            workspace_id,
            duplicate["document_id"],
            resolved_conversation_id,
        )
        update_job(job_id, "done", 100, "Duplicate detected. Existing document linked.")
        return UploadResponse(
            message="duplicate document detected, ingestion skipped",
            document_id=duplicate["document_id"],
            document_name=duplicate["file_name"],
            storage_location=duplicate.get("storage_location", ""),
            upload_timestamp=duplicate["upload_timestamp"],
            chunks_stored=duplicate.get("chunk_count", 0),
            conversation_id=resolved_conversation_id or "",
            duplicate=True,
            job_id=job_id,
        )

    storage_location = ""
    try:
        storage_location = upload_document_bytes(workspace_id, document_id, original_name, file_bytes)
        record = create_document_record(
            workspace_id,
            document_id,
            original_name,
            storage_location,
            file_hash=file_hash,
            file_size=len(file_bytes),
            conversation_id=resolved_conversation_id,
            collection_id=resolved_collection["collection_id"] if resolved_collection else None,
        )

        update_job(job_id, "indexing", 55, "Indexing document... generating embeddings.")
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / original_name
            temp_path.write_bytes(file_bytes)
            stored_count = _index_document(
                workspace_id=workspace_id,
                document_id=document_id,
                original_name=original_name,
                upload_timestamp=record["upload_timestamp"],
                temp_path=temp_path,
            )

        log_event(
            logger,
            "document_uploaded",
            user_id=user_id,
            workspace_id=workspace_id,
            document_id=document_id,
            document_name=original_name,
            storage_mode=get_storage_mode(),
            storage_location=storage_location,
            upload_timestamp=record["upload_timestamp"],
            upload_latency_ms=round((perf_counter() - upload_started_at) * 1000, 2),
        )
        clear_keyword_index_cache()
        clear_cached_results()
        update_job(job_id, "done", 100, f"Done! {stored_count} chunks indexed.")
        return UploadResponse(
            message="document processed successfully",
            document_id=document_id,
            document_name=original_name,
            storage_location=record["storage_location"],
            upload_timestamp=record["upload_timestamp"],
            chunks_stored=stored_count,
            conversation_id=resolved_conversation_id or "",
            job_id=job_id,
        )
    except HTTPException:
        remove_document_record(workspace_id, document_id)
        if storage_location:
            try:
                delete_document_object(storage_location)
            except Exception:
                pass
        update_job(job_id, "error", 100, "Document ingestion failed.")
        raise
    except Exception as exc:
        remove_document_record(workspace_id, document_id)
        if storage_location:
            try:
                delete_document_object(storage_location)
            except Exception:
                pass
        update_job(job_id, "error", 100, str(exc))
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/")
def root() -> dict:
    return {"status": "ok"}


@app.post("/auth/signup", response_model=AuthResponse)
def signup(payload: AuthRequest) -> AuthResponse:
    if not payload.email.strip() or not payload.password.strip():
        raise HTTPException(status_code=400, detail="Email and password are required.")
    return AuthResponse(**signup_user(payload.email, payload.password))


@app.post("/auth/login", response_model=AuthResponse)
def login(payload: AuthRequest) -> AuthResponse:
    if not payload.email.strip() or not payload.password.strip():
        raise HTTPException(status_code=400, detail="Email and password are required.")
    return AuthResponse(**login_user(payload.email, payload.password))


@app.get("/health", response_model=HealthResponse)
def healthcheck() -> HealthResponse:
    if settings.chroma_host:
        first_workspace_id = next(
            (workspace["workspace_id"] for workspace in list_workspaces()),
            "__healthcheck__",
        )
        vector_db_connected = check_vector_db_connection(first_workspace_id)
    else:
        vector_db_connected = True
    storage_connected = check_storage_connection()
    model_status = is_model_loaded()
    return HealthResponse(
        status="ok" if vector_db_connected and storage_connected and model_status else "degraded",
        vector_db="connected" if vector_db_connected else "disconnected",
        model_loaded=model_status,
        storage="connected" if storage_connected else "disconnected",
    )


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str) -> dict:
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.get("/workspaces", response_model=WorkspaceListResponse)
def get_workspaces(user_id: str = Depends(get_current_user)) -> WorkspaceListResponse:
    return WorkspaceListResponse(
        workspaces=[
            WorkspaceSummary(**workspace)
            for workspace in sorted(
                list_workspaces(),
                key=lambda item: item.get("created_at", ""),
            )
        ]
    )


@app.get("/workspaces/{workspace_id}/collections", response_model=CollectionListResponse)
def get_collections(
    workspace_id: str,
    user_id: str = Depends(get_current_user),
) -> CollectionListResponse:
    _workspace_or_404(workspace_id)
    return CollectionListResponse(
        collections=[CollectionSummary(**collection) for collection in list_collections(workspace_id)]
    )


@app.post("/workspaces/{workspace_id}/collections", response_model=CollectionSummary)
def create_collection_endpoint(
    workspace_id: str,
    payload: CollectionCreateRequest,
    user_id: str = Depends(get_current_user),
) -> CollectionSummary:
    _workspace_or_404(workspace_id)
    if not payload.collection_name.strip():
        raise HTTPException(status_code=400, detail="Collection name cannot be empty.")
    return CollectionSummary(**create_collection(workspace_id, payload.collection_name))


@app.delete("/workspaces/{workspace_id}/collections/{collection_id}", response_model=CollectionDeleteResponse)
def delete_collection_endpoint(
    workspace_id: str,
    collection_id: str,
    user_id: str = Depends(get_current_user),
) -> CollectionDeleteResponse:
    _workspace_or_404(workspace_id)
    collection = find_collection(workspace_id, collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found.")
    if collection["collection_name"] == "General":
        raise HTTPException(status_code=400, detail="The default collection cannot be deleted.")

    general = find_collection(workspace_id, None)
    moved_count = 0
    for record in list_document_records(workspace_id):
        if record.get("collection_id") == collection_id:
            update_document_record(
                workspace_id,
                record["document_id"],
                collection_id=general["collection_id"],
                collection_name=general["collection_name"],
            )
            moved_count += 1

    if not delete_collection(workspace_id, collection_id):
        raise HTTPException(status_code=400, detail="Collection could not be deleted.")
    clear_cached_results()

    return CollectionDeleteResponse(
        message="collection deleted successfully",
        collection_id=collection_id,
        moved_document_count=moved_count,
    )


@app.post("/workspaces", response_model=WorkspaceSummary)
def create_workspace_endpoint(
    payload: WorkspaceCreateRequest,
    user_id: str = Depends(get_current_user),
) -> WorkspaceSummary:
    workspace_name = payload.workspace_name.strip()
    if not workspace_name:
        raise HTTPException(status_code=400, detail="Workspace name cannot be empty.")
    workspace = create_workspace(workspace_name)
    log_event(
        logger,
        "workspace_created",
        user_id=user_id,
        workspace_id=workspace["workspace_id"],
        workspace_name=workspace["workspace_name"],
    )
    return WorkspaceSummary(**workspace)


@app.get("/workspaces/{workspace_id}/overview", response_model=WorkspaceOverviewResponse)
def workspace_overview(
    workspace_id: str,
    user_id: str = Depends(get_current_user),
) -> WorkspaceOverviewResponse:
    workspace = _workspace_or_404(workspace_id)
    documents = list_document_records(workspace_id)
    topics = Counter(
        topic
        for document in documents
        for topic in document.get("topics", [])
    )
    entities = {
        entity
        for document in documents
        for entity in document.get("entities", [])
    }
    recent_documents = sorted(
        documents,
        key=lambda item: item.get("upload_timestamp", ""),
        reverse=True,
    )[:5]
    return WorkspaceOverviewResponse(
        workspace_id=workspace_id,
        workspace_name=workspace["workspace_name"],
        collection_count=len(list_collections(workspace_id)),
        document_count=len(documents),
        topic_count=sum(len(document.get("topics", [])) for document in documents),
        entity_count=len(entities),
        top_topics=[topic for topic, _ in topics.most_common(6)],
        recent_documents=[
            {
                "document_id": document["document_id"],
                "file_name": document["file_name"],
                "collection_name": document.get("collection_name", ""),
                "upload_timestamp": document["upload_timestamp"],
            }
            for document in recent_documents
        ],
    )


@app.delete("/workspaces/{workspace_id}", response_model=WorkspaceDeleteResponse)
def delete_workspace_endpoint(
    workspace_id: str,
    user_id: str = Depends(get_current_user),
) -> WorkspaceDeleteResponse:
    workspace = _workspace_or_404(workspace_id)
    delete_workspace_index(workspace_id)
    delete_workspace(workspace_id)
    clear_keyword_index_cache()
    clear_cached_results()
    log_event(
        logger,
        "workspace_deleted",
        user_id=user_id,
        workspace_id=workspace_id,
        workspace_name=workspace["workspace_name"],
    )
    return WorkspaceDeleteResponse(
        message="workspace deleted successfully",
        workspace_id=workspace_id,
    )


@app.get("/workspaces/{workspace_id}/documents", response_model=DocumentListResponse)
def list_documents(
    workspace_id: str,
    user_id: str = Depends(get_current_user),
) -> DocumentListResponse:
    _workspace_or_404(workspace_id)
    documents = [
        DocumentSummary(
            document_id=record["document_id"],
            file_name=record["file_name"],
            storage_location=record.get("storage_location", ""),
            upload_timestamp=record["upload_timestamp"],
            file_size=record.get("file_size", 0),
            chunk_count=record.get("chunk_count", 0),
            indexed_at=record.get("indexed_at"),
            summary=record.get("summary", ""),
            topics=record.get("topics", []),
            entities=record.get("entities", []),
            concepts=record.get("concepts", []),
            conversation_ids=record.get("conversation_ids", []),
            collection_id=record.get("collection_id"),
            collection_name=record.get("collection_name", ""),
        )
        for record in sorted(
            list_document_records(workspace_id),
            key=lambda item: item.get("upload_timestamp", ""),
            reverse=True,
        )
    ]
    return DocumentListResponse(documents=documents)


@app.post("/workspaces/{workspace_id}/upload", response_model=UploadResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    workspace_id: str,
    file: UploadFile = File(...),
    conversation_id: str | None = Form(None),
    collection_id: str | None = Form(None),
    user_id: str = Depends(get_current_user),
) -> UploadResponse:
    _workspace_or_404(workspace_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(sorted(SUPPORTED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Supported types: {supported}",
        )

    original_name = Path(file.filename or "").name
    file_bytes = await file.read()
    max_upload_bytes = settings.max_upload_mb * 1024 * 1024
    if len(file_bytes) > max_upload_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_upload_mb}MB limit.")
    job_id = uuid4().hex
    document_id = generate_document_id()
    resolved_conversation_id = (
        ensure_conversation(workspace_id, conversation_id) if conversation_id else None
    )
    create_job(job_id)
    background_tasks.add_task(
        _ingest_document_bytes,
        workspace_id,
        document_id=document_id,
        original_name=original_name,
        file_bytes=file_bytes,
        conversation_id=conversation_id,
        collection_id=collection_id,
        user_id=user_id,
        job_id=job_id,
    )
    return UploadResponse(
        message="document upload accepted",
        document_id=document_id,
        document_name=original_name,
        storage_location="",
        upload_timestamp=datetime.now(timezone.utc).isoformat(),
        chunks_stored=0,
        conversation_id=resolved_conversation_id or "",
        job_id=job_id,
    )


@app.post("/workspaces/{workspace_id}/query", response_model=QueryResponse)
@limiter.limit("30/minute")
def query_documents(
    request: Request,
    workspace_id: str,
    payload: QueryRequest,
    user_id: str = Depends(get_current_user),
) -> QueryResponse:
    _workspace_or_404(workspace_id)
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        return answer_question(
            workspace_id,
            payload.question,
            payload.conversation_id,
            payload.session_id,
            payload.use_global_knowledge,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/workspaces/{workspace_id}/ingest-url", response_model=UploadResponse)
@limiter.limit("10/minute")
async def ingest_url(
    request: Request,
    background_tasks: BackgroundTasks,
    workspace_id: str,
    payload: UrlIngestRequest,
    user_id: str = Depends(get_current_user),
) -> UploadResponse:
    _workspace_or_404(workspace_id)
    if not payload.url.strip():
        raise HTTPException(status_code=400, detail="URL is required.")

    job_id = uuid4().hex
    create_job(job_id)
    update_job(job_id, "uploading", 15, "Fetching web page...")
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
            response = await client.get(payload.url.strip())
            response.raise_for_status()
        text = _clean_web_text(response.text)
        if not text.strip():
            raise HTTPException(status_code=400, detail="No readable text was found at the provided URL.")
        page_title = BeautifulSoup(response.text, "html.parser").title
        base_name = (page_title.get_text(strip=True) if page_title else payload.url.strip()).strip() or "web-page"
        safe_name = re.sub(r"[^A-Za-z0-9._ -]+", "-", base_name).strip(" .-") or "web-page"
        file_name = f"{safe_name[:80]}.txt"
        document_id = generate_document_id()
        resolved_conversation_id = (
            ensure_conversation(workspace_id, payload.conversation_id) if payload.conversation_id else None
        )
        background_tasks.add_task(
            _ingest_document_bytes,
            workspace_id,
            document_id=document_id,
            original_name=file_name,
            file_bytes=text.encode("utf-8"),
            conversation_id=payload.conversation_id,
            collection_id=payload.collection_id,
            user_id=user_id,
            job_id=job_id,
        )
        return UploadResponse(
            message="url ingestion accepted",
            document_id=document_id,
            document_name=file_name,
            storage_location="",
            upload_timestamp=datetime.now(timezone.utc).isoformat(),
            chunks_stored=0,
            conversation_id=resolved_conversation_id or "",
            job_id=job_id,
        )
    except HTTPException:
        update_job(job_id, "error", 100, "URL ingestion failed.")
        raise
    except httpx.HTTPError as exc:
        update_job(job_id, "error", 100, "Could not fetch the URL.")
        raise HTTPException(status_code=400, detail=f"Could not fetch URL: {exc}") from exc


@app.post("/workspaces/{workspace_id}/query/stream")
@limiter.limit("30/minute")
def stream_query_documents(
    request: Request,
    workspace_id: str,
    payload: QueryRequest,
    user_id: str = Depends(get_current_user),
) -> StreamingResponse:
    _workspace_or_404(workspace_id)
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    return StreamingResponse(
        stream_answer_events(
            workspace_id,
            payload.question,
            payload.conversation_id,
            payload.session_id,
            payload.use_global_knowledge,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.get("/workspaces/{workspace_id}/search", response_model=SearchResponse)
def search_documents(
    workspace_id: str,
    q: str,
    conversation_id: str | None = None,
    user_id: str = Depends(get_current_user),
) -> SearchResponse:
    _workspace_or_404(workspace_id)
    if not q.strip():
        raise HTTPException(status_code=400, detail="Search query cannot be empty.")

    try:
        retrieval = hybrid_search(
            workspace_id,
            q,
            vector_top_k=max(settings.top_k_results * 2, settings.top_k_results),
            final_k=settings.top_k_results,
            document_ids=get_conversation_document_ids(workspace_id, conversation_id) or None,
        )
        return format_search_results(retrieval["results"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/workspaces/{workspace_id}/knowledge-graph", response_model=KnowledgeGraphResponse)
def knowledge_graph(
    workspace_id: str,
    conversation_id: str | None = None,
    user_id: str = Depends(get_current_user),
) -> KnowledgeGraphResponse:
    _workspace_or_404(workspace_id)
    try:
        graph = build_knowledge_graph(workspace_id, conversation_id)
        return KnowledgeGraphResponse(**graph)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/workspaces/{workspace_id}/document-graph", response_model=KnowledgeGraphResponse)
def document_graph(
    workspace_id: str,
    docs: str = "",
    user_id: str = Depends(get_current_user),
) -> KnowledgeGraphResponse:
    _workspace_or_404(workspace_id)
    document_ids = [
        item.strip().strip("[]\"'")
        for item in docs.split(",")
        if item.strip().strip("[]\"'")
    ]
    try:
        graph = build_document_graph(workspace_id, document_ids)
        return KnowledgeGraphResponse(**graph)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.delete("/workspaces/{workspace_id}/documents/{document_id}", response_model=DeleteDocumentResponse)
def delete_document(
    workspace_id: str,
    document_id: str,
    user_id: str = Depends(get_current_user),
) -> DeleteDocumentResponse:
    _workspace_or_404(workspace_id)
    record = find_document_record(workspace_id, document_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found.")

    delete_document_embeddings(workspace_id, document_id)
    storage_location = record.get("storage_location", "")
    if storage_location:
        delete_document_object(storage_location)
    remove_document_record(workspace_id, document_id)
    clear_keyword_index_cache()
    clear_cached_results()

    log_event(
        logger,
        "document_deleted",
        user_id=user_id,
        workspace_id=workspace_id,
        document_id=document_id,
        document_name=record["file_name"],
        storage_mode=get_storage_mode(),
        storage_location=storage_location,
    )

    return DeleteDocumentResponse(message="document deleted successfully", document_id=document_id)


@app.post("/workspaces/{workspace_id}/documents/{document_id}/move", response_model=DocumentSummary)
def move_document(
    workspace_id: str,
    document_id: str,
    payload: MoveDocumentRequest,
    user_id: str = Depends(get_current_user),
) -> DocumentSummary:
    _workspace_or_404(workspace_id)
    record = find_document_record(workspace_id, document_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found.")
    collection = find_collection(workspace_id, payload.collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found.")

    updated = update_document_record(
        workspace_id,
        document_id,
        collection_id=collection["collection_id"],
        collection_name=collection["collection_name"],
    )
    clear_cached_results()
    return DocumentSummary(
        document_id=updated["document_id"],
        file_name=updated["file_name"],
        storage_location=updated.get("storage_location", ""),
        upload_timestamp=updated["upload_timestamp"],
        file_size=updated.get("file_size", 0),
        chunk_count=updated.get("chunk_count", 0),
        indexed_at=updated.get("indexed_at"),
        summary=updated.get("summary", ""),
        topics=updated.get("topics", []),
        entities=updated.get("entities", []),
        concepts=updated.get("concepts", []),
        conversation_ids=updated.get("conversation_ids", []),
        collection_id=updated.get("collection_id"),
        collection_name=updated.get("collection_name", ""),
    )


@app.get("/workspaces/{workspace_id}/documents/{document_id}/preview", response_model=DocumentPreviewResponse)
def preview_document(
    workspace_id: str,
    document_id: str,
    user_id: str = Depends(get_current_user),
) -> DocumentPreviewResponse:
    _workspace_or_404(workspace_id)
    record = find_document_record(workspace_id, document_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found.")
    content = get_document_text(workspace_id, document_id)
    return DocumentPreviewResponse(
        document_id=document_id,
        file_name=record["file_name"],
        content=content[:12000],
    )


@app.get(
    "/workspaces/{workspace_id}/documents/{document_id}/summary",
    response_model=DocumentIntelligenceResponse,
)
def document_summary(
    workspace_id: str,
    document_id: str,
    user_id: str = Depends(get_current_user),
) -> DocumentIntelligenceResponse:
    _workspace_or_404(workspace_id)
    record = find_document_record(workspace_id, document_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found.")
    return DocumentIntelligenceResponse(
        document_id=document_id,
        file_name=record["file_name"],
        summary=record.get("summary", ""),
        topics=record.get("topics", []),
        entities=record.get("entities", []),
        concepts=record.get("concepts", []),
        important_sections=record.get("important_sections", []),
    )


@app.post("/workspaces/{workspace_id}/documents/reindex", response_model=ReindexResponse)
def reindex_document(
    workspace_id: str,
    payload: ReindexRequest,
    user_id: str = Depends(get_current_user),
) -> ReindexResponse:
    _workspace_or_404(workspace_id)
    record = find_document_record(workspace_id, payload.document_id)
    if not record:
        raise HTTPException(status_code=404, detail="Document not found.")

    delete_document_embeddings(workspace_id, payload.document_id)
    storage_location = record.get("storage_location", "")
    if get_storage_mode() == "s3" and storage_location.startswith("s3://"):
        with TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir) / record["file_name"]
            download_document_to_path(storage_location, temp_path)
            stored_count = _index_document(
                workspace_id=workspace_id,
                document_id=payload.document_id,
                original_name=record["file_name"],
                upload_timestamp=record["upload_timestamp"],
                temp_path=temp_path,
            )
    elif storage_location:
        temp_path = Path(storage_location)
        if not temp_path.exists():
            raise HTTPException(status_code=404, detail="Stored document file not found.")
        stored_count = _index_document(
            workspace_id=workspace_id,
            document_id=payload.document_id,
            original_name=record["file_name"],
            upload_timestamp=record["upload_timestamp"],
            temp_path=temp_path,
        )
    else:
        raise HTTPException(status_code=404, detail="No document storage location found.")
    clear_keyword_index_cache()
    clear_cached_results()

    return ReindexResponse(
        message="document reindexed successfully",
        document_id=payload.document_id,
        chunks_stored=stored_count,
    )
