from collections import defaultdict
from typing import Dict, List, Tuple

from app.document_registry import list_document_records

MAX_TOPICS_PER_DOCUMENT = 8
MAX_ENTITIES_PER_DOCUMENT = 8
MAX_NODES = 200


def _slug(prefix: str, value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return f"{prefix}:{normalized or 'item'}"


def _add_node(nodes: Dict[str, Dict], node_id: str, node_type: str, label: str, **extra: object) -> None:
    if node_id in nodes or len(nodes) >= MAX_NODES:
        return
    nodes[node_id] = {
        "id": node_id,
        "type": node_type,
        "label": label,
        **extra,
    }


def _add_edge(edges: set[Tuple[str, str]], source: str, target: str) -> None:
    if source == target:
        return
    edges.add((source, target))


def _shared_counts(records: List[Dict]) -> tuple[int, int]:
    if len(records) < 2:
        return 0, 0
    topic_docs: Dict[str, int] = defaultdict(int)
    entity_docs: Dict[str, int] = defaultdict(int)
    for record in records:
        for topic in set(record.get("topics", [])[:MAX_TOPICS_PER_DOCUMENT]):
            topic_docs[topic] += 1
        for entity in set(record.get("entities", [])[:MAX_ENTITIES_PER_DOCUMENT]):
            entity_docs[entity] += 1
    shared_topics = sum(1 for count in topic_docs.values() if count > 1)
    shared_entities = sum(1 for count in entity_docs.values() if count > 1)
    return shared_topics, shared_entities


def build_document_graph(workspace_id: str, document_ids: List[str]) -> Dict:
    selected_ids = {document_id for document_id in document_ids if document_id}
    records = [
        record
        for record in list_document_records(workspace_id)
        if record.get("document_id") in selected_ids
    ]

    nodes: Dict[str, Dict] = {}
    edges: set[Tuple[str, str]] = set()
    topic_documents: Dict[str, List[str]] = defaultdict(list)
    entity_documents: Dict[str, List[str]] = defaultdict(list)
    topic_entities: Dict[str, set[str]] = defaultdict(set)
    collection_documents: Dict[str, List[str]] = defaultdict(list)

    for record in records:
        collection_id = record.get("collection_id") or "collection:general"
        collection_node_id = f"collection:{collection_id}"
        document_node_id = f"document:{record['document_id']}"
        topics = record.get("topics", [])[:MAX_TOPICS_PER_DOCUMENT]
        entities = record.get("entities", [])[:MAX_ENTITIES_PER_DOCUMENT]

        _add_node(
            nodes,
            collection_node_id,
            "collection",
            record.get("collection_name", "General"),
        )
        collection_documents[collection_node_id].append(record["file_name"])

        _add_node(
            nodes,
            document_node_id,
            "document",
            record["file_name"],
            document_id=record["document_id"],
            summary=record.get("summary", ""),
            topics=topics,
            entities=entities,
            concepts=record.get("concepts", []),
            upload_timestamp=record.get("upload_timestamp", ""),
        )
        _add_edge(edges, collection_node_id, document_node_id)

        for topic in topics:
            topic_id = _slug("topic", topic)
            _add_node(nodes, topic_id, "topic", topic)
            _add_edge(edges, document_node_id, topic_id)
            topic_documents[topic_id].append(record["file_name"])

        for entity in entities:
            entity_id = _slug("entity", entity)
            _add_node(nodes, entity_id, "entity", entity)
            _add_edge(edges, document_node_id, entity_id)
            entity_documents[entity_id].append(record["file_name"])
            for topic in topics:
                topic_id = _slug("topic", topic)
                topic_entities[topic_id].add(entity)

    for node_id, node in list(nodes.items()):
        if node["type"] == "collection":
            node["documents"] = sorted(set(collection_documents.get(node_id, [])))
        elif node["type"] == "topic":
            node["documents"] = sorted(set(topic_documents.get(node_id, [])))
            node["related_entities"] = sorted(topic_entities.get(node_id, set()))
        elif node["type"] == "entity":
            node["documents"] = sorted(set(entity_documents.get(node_id, [])))
            node["related_topics"] = sorted(
                {
                    nodes[source]["label"]
                    for source, target in edges
                    if target == node_id and source in nodes and nodes[source]["type"] == "topic"
                }.union(
                    {
                        nodes[target]["label"]
                        for source, target in edges
                        if source == node_id and target in nodes and nodes[target]["type"] == "topic"
                    }
                )
            )

    shared_topic_count, shared_entity_count = _shared_counts(records)
    edge_payload = [{"source": source, "target": target} for source, target in sorted(edges)]
    return {
        "nodes": list(nodes.values()),
        "edges": edge_payload,
        "meta": {
            "selected_document_ids": [record["document_id"] for record in records],
            "document_count": sum(1 for node in nodes.values() if node["type"] == "document"),
            "collection_count": sum(1 for node in nodes.values() if node["type"] == "collection"),
            "topic_count": sum(1 for node in nodes.values() if node["type"] == "topic"),
            "entity_count": sum(1 for node in nodes.values() if node["type"] == "entity"),
            "shared_topic_count": shared_topic_count,
            "shared_entity_count": shared_entity_count,
            "has_shared_relationships": bool(shared_topic_count or shared_entity_count),
        },
    }
