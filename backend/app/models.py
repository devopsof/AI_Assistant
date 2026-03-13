from typing import List, Optional

from pydantic import BaseModel


class WorkspaceCreateRequest(BaseModel):
    workspace_name: str


class WorkspaceSummary(BaseModel):
    workspace_id: str
    workspace_name: str
    created_at: str


class WorkspaceListResponse(BaseModel):
    workspaces: List[WorkspaceSummary]


class WorkspaceDeleteResponse(BaseModel):
    message: str
    workspace_id: str


class CollectionCreateRequest(BaseModel):
    collection_name: str


class CollectionSummary(BaseModel):
    collection_id: str
    workspace_id: str
    collection_name: str
    created_at: str


class CollectionListResponse(BaseModel):
    collections: List[CollectionSummary]


class CollectionDeleteResponse(BaseModel):
    message: str
    collection_id: str
    moved_document_count: int


class MoveDocumentRequest(BaseModel):
    collection_id: str


class WorkspaceOverviewResponse(BaseModel):
    workspace_id: str
    workspace_name: str
    collection_count: int
    document_count: int
    topic_count: int
    entity_count: int
    top_topics: List[str]
    recent_documents: List[dict]


class AuthRequest(BaseModel):
    email: str
    password: str
    name: str | None = None


class AuthResponse(BaseModel):
    token: str
    user_id: str


class QueryRequest(BaseModel):
    question: str
    conversation_id: Optional[str] = None
    session_id: Optional[str] = None
    use_global_knowledge: bool = False


class UrlIngestRequest(BaseModel):
    url: str
    conversation_id: Optional[str] = None
    collection_id: Optional[str] = None


class SourceMetadata(BaseModel):
    document_id: str
    document: str
    chunk: str
    chunk_index: int
    upload_timestamp: str
    similarity_score: float
    chunk_text: Optional[str] = None
    previous_chunk_text: Optional[str] = None
    next_chunk_text: Optional[str] = None


class QueryResponse(BaseModel):
    answer: str
    conversation_id: str
    session_id: str
    rewritten_query: str
    confidence: float
    suggestions: List[str]
    debug: dict
    insights: List[dict] = []
    themes: List[str] = []
    sources: List[SourceMetadata]


class UploadResponse(BaseModel):
    message: str
    document_id: str
    document_name: str
    storage_location: str
    upload_timestamp: str
    chunks_stored: int
    conversation_id: str = ""
    duplicate: bool = False
    job_id: str = ""


class DocumentSummary(BaseModel):
    document_id: str
    file_name: str
    storage_location: str
    upload_timestamp: str
    file_size: int = 0
    chunk_count: int = 0
    indexed_at: Optional[str] = None
    summary: str = ""
    topics: List[str] = []
    entities: List[str] = []
    concepts: List[str] = []
    conversation_ids: List[str] = []
    collection_id: Optional[str] = None
    collection_name: str = ""


class DocumentListResponse(BaseModel):
    documents: List[DocumentSummary]


class DeleteDocumentResponse(BaseModel):
    message: str
    document_id: str


class ReindexRequest(BaseModel):
    document_id: str


class ReindexResponse(BaseModel):
    message: str
    document_id: str
    chunks_stored: int


class HealthResponse(BaseModel):
    status: str
    vector_db: str
    model_loaded: bool
    storage: str


class SearchResult(BaseModel):
    document_id: str
    document: str
    chunk_index: int
    chunk_id: str
    text: str
    previous_chunk_text: Optional[str] = None
    next_chunk_text: Optional[str] = None
    similarity_score: float
    keyword_score: float = 0.0
    combined_score: float


class SearchResponse(BaseModel):
    results: List[SearchResult]


class DocumentPreviewResponse(BaseModel):
    document_id: str
    file_name: str
    content: str


class DocumentIntelligenceResponse(BaseModel):
    document_id: str
    file_name: str
    summary: str
    topics: List[str]
    entities: List[str]
    concepts: List[str]
    important_sections: List[str]


class KnowledgeGraphNode(BaseModel):
    id: str
    type: str
    label: str
    summary: str | None = None
    topics: List[str] = []
    entities: List[str] = []
    concepts: List[str] = []
    upload_timestamp: str | None = None
    documents: List[str] = []
    related_entities: List[str] = []
    related_topics: List[str] = []


class KnowledgeGraphEdge(BaseModel):
    source: str
    target: str


class KnowledgeGraphResponse(BaseModel):
    nodes: List[KnowledgeGraphNode]
    edges: List[KnowledgeGraphEdge]
    meta: dict
