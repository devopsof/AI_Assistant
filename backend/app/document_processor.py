import re
import email
from pathlib import Path
from typing import List

import tiktoken
from pypdf import PdfReader

from app.config import get_settings

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown", ".docx", ".epub", ".eml"}



def extract_text(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(file_path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    if suffix in {".txt", ".md", ".markdown"}:
        return file_path.read_text(encoding="utf-8", errors="ignore")

    if suffix == ".docx":
        from docx import Document as DocxDocument

        doc = DocxDocument(str(file_path))
        return "\n".join(para.text for para in doc.paragraphs if para.text.strip())

    if suffix == ".epub":
        import ebooklib
        from ebooklib import epub
        from bs4 import BeautifulSoup

        book = epub.read_epub(str(file_path))
        texts = []
        for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
            soup = BeautifulSoup(item.get_content(), "html.parser")
            texts.append(soup.get_text(separator=" ", strip=True))
        return "\n".join(text for text in texts if text.strip())

    if suffix == ".eml":
        from email import policy

        msg = email.message_from_bytes(file_path.read_bytes(), policy=policy.default)
        parts = [
            f"From: {msg['from']}",
            f"To: {msg['to']}",
            f"Subject: {msg['subject']}",
            f"Date: {msg['date']}",
            "---",
        ]
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    parts.append(part.get_content())
        else:
            parts.append(msg.get_content())
        return "\n".join(str(part) for part in parts if part)

    raise ValueError(f"Unsupported file type: {suffix}")



def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()



def _split_large_unit(unit: str, encoder: tiktoken.Encoding, chunk_size: int) -> List[str]:
    token_ids = encoder.encode(unit)
    if len(token_ids) <= chunk_size:
        return [unit]

    sentence_parts = re.split(r"(?<=[.!?])\s+", unit)
    if len(sentence_parts) == 1:
        return [encoder.decode(token_ids[index : index + chunk_size]).strip() for index in range(0, len(token_ids), chunk_size)]

    chunks: List[str] = []
    current = ""
    current_tokens = 0

    for sentence in sentence_parts:
        sentence_tokens = len(encoder.encode(sentence))
        if current and current_tokens + sentence_tokens > chunk_size:
            chunks.append(current.strip())
            current = sentence
            current_tokens = sentence_tokens
        else:
            current = f"{current} {sentence}".strip()
            current_tokens += sentence_tokens

    if current:
        chunks.append(current.strip())

    return chunks


def split_text_into_chunks(text: str) -> List[str]:
    settings = get_settings()
    encoder = tiktoken.get_encoding("cl100k_base")
    tokens = encoder.encode(text)

    if not tokens:
        return []

    chunk_size = settings.chunk_size_tokens
    overlap = settings.chunk_overlap_tokens
    semantic_units: List[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        semantic_units.extend(
            unit for unit in _split_large_unit(paragraph, encoder, chunk_size) if unit.strip()
        )

    chunks: List[str] = []
    current_units: List[str] = []
    current_tokens = 0

    for unit in semantic_units:
        unit_tokens = len(encoder.encode(unit))
        if current_units and current_tokens + unit_tokens > chunk_size:
            chunk_text = "\n\n".join(current_units).strip()
            if chunk_text:
                chunks.append(chunk_text)

            overlap_tokens: List[int] = []
            overlap_units: List[str] = []
            for previous_unit in reversed(current_units):
                previous_tokens = encoder.encode(previous_unit)
                if len(overlap_tokens) + len(previous_tokens) > overlap:
                    break
                overlap_tokens = previous_tokens + overlap_tokens
                overlap_units.insert(0, previous_unit)

            current_units = overlap_units.copy()
            current_tokens = len(overlap_tokens)

        current_units.append(unit)
        current_tokens += unit_tokens

    if current_units:
        chunk_text = "\n\n".join(current_units).strip()
        if chunk_text:
            chunks.append(chunk_text)

    return chunks



def process_document(file_path: Path) -> List[str]:
    cleaned_text = get_clean_document_text(file_path)
    return split_text_into_chunks(cleaned_text)


def get_clean_document_text(file_path: Path) -> str:
    raw_text = extract_text(file_path)
    return clean_text(raw_text)


def prepare_document(file_path: Path) -> tuple[str, List[str]]:
    cleaned_text = get_clean_document_text(file_path)
    return cleaned_text, split_text_into_chunks(cleaned_text)
