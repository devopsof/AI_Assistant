import re


QUESTION_WORDS = {"what", "who", "when", "where", "why", "how", "is", "are", "did", "does"}
INTENT_HINTS = {
    "creator": {"create", "created", "creator", "developed", "built", "made"},
    "definition": {"what", "define", "meaning", "is"},
    "time": {"when", "date", "year", "time"},
}


def detect_intent(query: str) -> str:
    lowered = query.lower()
    for intent, keywords in INTENT_HINTS.items():
        if any(keyword in lowered for keyword in keywords):
            return intent
    return "general"


def preprocess_query(query: str) -> dict:
    normalized = re.sub(r"[^\w\s]", " ", query.lower())
    tokens = [token for token in normalized.split() if token and token not in QUESTION_WORDS]
    compact_query = " ".join(tokens) or normalized.strip()
    return {
        "original_query": query,
        "normalized_query": normalized.strip(),
        "keyword_query": compact_query.strip(),
        "intent": detect_intent(query),
    }
