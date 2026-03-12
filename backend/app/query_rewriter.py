import re
from typing import List, Dict


PRONOUN_PATTERN = re.compile(r"\b(it|they|them|that|this|he|she)\b", re.IGNORECASE)


def _extract_recent_subject(messages: List[Dict]) -> str:
    for message in reversed(messages):
        content = message.get("content", "").strip()
        if not content:
            continue
        sentences = re.split(r"[.?!]\s*", content)
        for sentence in reversed(sentences):
            words = sentence.strip().split()
            if not words:
                continue
            candidates = [word.strip(",.?!") for word in words if word[:1].isupper()]
            if candidates:
                return " ".join(candidates[-2:])
    return ""


def rewrite_query(question: str, conversation_messages: List[Dict]) -> str:
    subject = _extract_recent_subject(conversation_messages)
    if not subject:
        return question
    if not PRONOUN_PATTERN.search(question):
        return question
    return PRONOUN_PATTERN.sub(subject, question, count=1)
