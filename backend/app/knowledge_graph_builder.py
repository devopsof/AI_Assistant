from collections import defaultdict
from typing import Dict, List, Tuple

from app.document_registry import list_document_records

MAX_TOPICS_PER_DOCUMENT = 5
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
    edges.add(tuple(sorted((source, target))))


def build_knowledge_graph(workspace_id: str, conversation_id: str | None = None) -> Dict:
    records = list_document_records(workspace_id, conversation_id)
    nodes: Dict[str, Dict] = {}
    edges: set[Tuple[str, str]] = set()
    topic_documents: Dict[str, List[str]] = defaultdict(list)
    entity_documents: Dict[str, List[str]] = defaultdict(list)
    topic_entities: Dict[str, set[str]] = defaultdict(set)

    for record in records:
        document_id = f"document:{record['document_id']}"
        _add_node(
            nodes,
            document_id,
            "document",
            record["file_name"],
            summary=record.get("summary", ""),
            topics=record.get("topics", []),
            entities=record.get("entities", []),
            concepts=record.get("concepts", []),
            upload_timestamp=record.get("upload_timestamp", ""),
        )

        topics = record.get("topics", [])[:MAX_TOPICS_PER_DOCUMENT]
        entities = record.get("entities", [])[:MAX_ENTITIES_PER_DOCUMENT]

        for topic in topics:
            topic_id = _slug("topic", topic)
            _add_node(nodes, topic_id, "topic", topic)
            _add_edge(edges, document_id, topic_id)
            topic_documents[topic_id].append(record["file_name"])

        for entity in entities:
            entity_id = _slug("entity", entity)
            _add_node(nodes, entity_id, "entity", entity)
            _add_edge(edges, document_id, entity_id)
            entity_documents[entity_id].append(record["file_name"])
            for topic in topics:
                topic_id = _slug("topic", topic)
                _add_edge(edges, topic_id, entity_id)
                topic_entities[topic_id].add(entity_id)

    for node_id, node in list(nodes.items()):
        if node["type"] == "topic":
            node["documents"] = topic_documents.get(node_id, [])
            node["related_entities"] = [nodes[entity_id]["label"] for entity_id in topic_entities.get(node_id, set()) if entity_id in nodes]
        elif node["type"] == "entity":
            node["documents"] = entity_documents.get(node_id, [])
            related_topics = []
            for source, target in edges:
                if node_id not in {source, target}:
                    continue
                other = target if source == node_id else source
                if other in nodes and nodes[other]["type"] == "topic":
                    related_topics.append(nodes[other]["label"])
            node["related_topics"] = sorted(set(related_topics))

    edge_payload = [{"source": source, "target": target} for source, target in sorted(edges)]
    return {
        "nodes": list(nodes.values()),
        "edges": edge_payload,
        "meta": {
            "document_count": sum(1 for node in nodes.values() if node["type"] == "document"),
            "topic_count": sum(1 for node in nodes.values() if node["type"] == "topic"),
            "entity_count": sum(1 for node in nodes.values() if node["type"] == "entity"),
        },
    }


def describe_connection_query(
    workspace_id: str,
    first: str,
    second: str,
    conversation_id: str | None = None,
) -> Dict | None:
    graph = build_knowledge_graph(workspace_id, conversation_id)
    nodes = {node["id"]: node for node in graph["nodes"]}
    label_index = {node["label"].lower(): node for node in graph["nodes"]}
    first_node = label_index.get(first.lower())
    second_node = label_index.get(second.lower())
    if not first_node or not second_node:
        return None

    adjacency: Dict[str, set[str]] = defaultdict(set)
    for edge in graph["edges"]:
        adjacency[edge["source"]].add(edge["target"])
        adjacency[edge["target"]].add(edge["source"])

    shared_neighbors = adjacency[first_node["id"]].intersection(adjacency[second_node["id"]])
    shared_labels = [nodes[node_id]["label"] for node_id in shared_neighbors if node_id in nodes]
    return {
        "first": first_node,
        "second": second_node,
        "shared_labels": sorted(shared_labels),
    }
