from typing import Dict, List

from chromadb.api.models.Collection import Collection

from app.config import get_settings
from app.database import get_chroma_client


def get_collection_name(workspace_id: str) -> str:
    settings = get_settings()
    return f"{settings.chroma_collection_name}_{workspace_id}"


def get_collection(workspace_id: str) -> Collection:
    client = get_chroma_client(workspace_id)
    return client.get_or_create_collection(name=get_collection_name(workspace_id))


def store_embeddings(
    workspace_id: str,
    document_id: str,
    document_name: str,
    upload_timestamp: str,
    chunks: List[str],
    embeddings: List[List[float]],
) -> int:
    collection = get_collection(workspace_id)
    ids = [f"{document_id}:chunk_{index + 1}" for index in range(len(chunks))]
    metadatas = [
        {
            "workspace_id": workspace_id,
            "document_id": document_id,
            "document_name": document_name,
            "chunk_id": f"chunk_{index + 1}",
            "chunk_index": index + 1,
            "upload_timestamp": upload_timestamp,
        }
        for index in range(len(chunks))
    ]
    collection.upsert(
        ids=ids,
        documents=chunks,
        embeddings=embeddings,
        metadatas=metadatas,
    )
    return len(ids)


def similarity_search(
    workspace_id: str,
    query_embedding: List[float],
    top_k: int = 5,
    document_ids: List[str] | None = None,
) -> List[Dict]:
    collection = get_collection(workspace_id)
    query_kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": top_k,
        "include": ["documents", "metadatas", "distances"],
    }
    if document_ids:
        query_kwargs["where"] = {"document_id": {"$in": document_ids}}
    results = collection.query(**query_kwargs)

    matches: List[Dict] = []
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    for document, metadata, distance in zip(documents, metadatas, distances):
        matches.append(
            {
                "chunk_text": document,
                "document_id": metadata.get("document_id", "unknown"),
                "document_name": metadata.get("document_name", "unknown"),
                "chunk_id": metadata.get("chunk_id", "unknown"),
                "chunk_index": metadata.get("chunk_index", -1),
                "upload_timestamp": metadata.get("upload_timestamp", ""),
                "similarity_score": distance,
            }
        )

    return matches


def get_all_chunks(workspace_id: str) -> List[Dict]:
    collection = get_collection(workspace_id)
    results = collection.get(include=["documents", "metadatas"])
    matches: List[Dict] = []
    ids = results.get("ids", [])
    documents = results.get("documents", [])
    metadatas = results.get("metadatas", [])

    for chunk_id, document, metadata in zip(ids, documents, metadatas):
        matches.append(
            {
                "id": chunk_id,
                "chunk_text": document,
                "document_id": metadata.get("document_id", "unknown"),
                "document_name": metadata.get("document_name", "unknown"),
                "chunk_id": metadata.get("chunk_id", "unknown"),
                "chunk_index": metadata.get("chunk_index", -1),
                "upload_timestamp": metadata.get("upload_timestamp", ""),
            }
        )
    return matches


def get_chunk_neighbors(workspace_id: str, document_id: str, chunk_index: int) -> Dict[str, str | None]:
    collection = get_collection(workspace_id)
    previous_id = f"{document_id}:chunk_{chunk_index - 1}"
    next_id = f"{document_id}:chunk_{chunk_index + 1}"
    result = collection.get(ids=[previous_id, next_id], include=["documents"])
    ids = result.get("ids", [])
    documents = result.get("documents", [])
    mapping = dict(zip(ids, documents))
    return {
        "previous_chunk_text": mapping.get(previous_id) or "",
        "next_chunk_text": mapping.get(next_id) or "",
    }


def delete_document_embeddings(workspace_id: str, document_id: str) -> None:
    collection = get_collection(workspace_id)
    collection.delete(where={"document_id": document_id})


def delete_workspace_index(workspace_id: str) -> None:
    client = get_chroma_client(workspace_id)
    try:
        client.delete_collection(name=get_collection_name(workspace_id))
    except Exception:
        pass
