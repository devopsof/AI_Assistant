import re
from collections import Counter
from typing import Dict, List


STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "into", "is", "it", "its", "of", "on", "or", "that", "the", "their", "this",
    "to", "was", "were", "will", "with", "you", "your", "we", "our", "they", "them",
    "about", "after", "all", "also", "any", "can", "do", "does", "each", "if", "more",
    "most", "not", "such", "than", "then", "there", "these", "those", "what", "when",
    "where", "which", "who", "why", "how", "using", "used", "use",
}


def _sentences(text: str) -> List[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [part.strip() for part in parts if part.strip()]


def _paragraphs(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[A-Za-z][A-Za-z\-]{2,}", text.lower())


def _keyword_scores(text: str) -> Counter:
    tokens = [token for token in _tokenize(text) if token not in STOPWORDS]
    return Counter(tokens)


def generate_document_summary(text: str, max_sentences: int = 2) -> str:
    sentences = _sentences(text)
    if not sentences:
        return ""
    if len(sentences) <= max_sentences:
        return " ".join(sentences[:max_sentences])

    keyword_scores = _keyword_scores(text)
    ranked = []
    for index, sentence in enumerate(sentences[:12]):
        score = sum(keyword_scores.get(token, 0) for token in _tokenize(sentence))
        ranked.append((score, -index, sentence))

    ranked.sort(reverse=True)
    selected = [sentence for _, _, sentence in ranked[:max_sentences]]
    ordered = [sentence for sentence in sentences if sentence in selected]
    return " ".join(ordered[:max_sentences]).strip()


def extract_topics(text: str, limit: int = 5) -> List[str]:
    keyword_scores = _keyword_scores(text)
    phrases = Counter()
    tokens = [token for token in _tokenize(text) if token not in STOPWORDS]

    for index in range(len(tokens) - 1):
        first = tokens[index]
        second = tokens[index + 1]
        if first in STOPWORDS or second in STOPWORDS:
            continue
        phrases[f"{first} {second}"] += 1

    ranked = [phrase for phrase, count in phrases.most_common(limit * 2) if count > 1]
    if len(ranked) < limit:
        ranked.extend(
            word for word, _ in keyword_scores.most_common(limit * 3) if word not in ranked and len(word) > 3
        )

    cleaned = []
    for topic in ranked:
        normalized = topic.strip().lower()
        if normalized and normalized not in cleaned:
            cleaned.append(normalized)
        if len(cleaned) >= limit:
            break
    return cleaned


def extract_entities(text: str, limit: int = 8) -> List[str]:
    patterns = re.findall(r"\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|[A-Z]{2,})\b", text)
    counts = Counter(pattern.strip() for pattern in patterns if len(pattern.strip()) > 2)
    return [entity for entity, _ in counts.most_common(limit)]


def extract_key_concepts(text: str, limit: int = 8) -> List[str]:
    keyword_scores = _keyword_scores(text)
    concepts = [word for word, count in keyword_scores.most_common(limit * 2) if count > 1]
    return concepts[:limit]


def extract_important_sections(text: str, limit: int = 5) -> List[str]:
    paragraphs = _paragraphs(text)
    headings = []
    for paragraph in paragraphs:
        first_line = paragraph.splitlines()[0].strip()
        if first_line.startswith("#"):
            headings.append(first_line.lstrip("# ").strip())
        elif len(first_line.split()) <= 8 and first_line[:1].isupper():
            headings.append(first_line)

    if headings:
        return headings[:limit]

    summaries = []
    for paragraph in paragraphs[:limit]:
        sentence = _sentences(paragraph)
        if sentence:
            summaries.append(sentence[0][:120].strip())
    return summaries[:limit]


def analyze_document_text(text: str) -> Dict[str, List[str] | str]:
    return {
        "summary": generate_document_summary(text),
        "topics": extract_topics(text),
        "entities": extract_entities(text),
        "concepts": extract_key_concepts(text),
        "important_sections": extract_important_sections(text),
    }
