from functools import lru_cache
from typing import List

from sentence_transformers import SentenceTransformer

from app.config import get_settings


@lru_cache
def _get_embedding_model() -> SentenceTransformer:
    settings = get_settings()
    model_name = settings.model_name or settings.embedding_model_name
    return SentenceTransformer(model_name)


def generate_embedding(text: str) -> List[float]:
    model = _get_embedding_model()
    vector = model.encode(text, normalize_embeddings=True)
    return vector.tolist()


def is_model_loaded() -> bool:
    return _get_embedding_model() is not None
