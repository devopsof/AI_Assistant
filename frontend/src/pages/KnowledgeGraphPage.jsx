import { useEffect, useMemo, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";

import { fetchDocumentGraph } from "../services/api";

const VIEWBOX_WIDTH = 840;
const VIEWBOX_HEIGHT = 520;
const NODE_COLORS = {
  collection: "#bfdbfe",
  document: "#60a5fa",
  topic: "#a78bfa",
  entity: "#f59e0b",
};

function fitNodes(nodes) {
  if (!nodes.length) {
    return nodes;
  }

  const minX = Math.min(...nodes.map((node) => node.x ?? 0));
  const maxX = Math.max(...nodes.map((node) => node.x ?? 0));
  const minY = Math.min(...nodes.map((node) => node.y ?? 0));
  const maxY = Math.max(...nodes.map((node) => node.y ?? 0));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const scale = Math.min((VIEWBOX_WIDTH - 120) / width, (VIEWBOX_HEIGHT - 120) / height, 1.8);

  return nodes.map((node) => ({
    ...node,
    x: (node.x - minX - width / 2) * scale + VIEWBOX_WIDTH / 2,
    y: (node.y - minY - height / 2) * scale + VIEWBOX_HEIGHT / 2,
  }));
}

function runLayout(graph) {
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const links = graph.edges.map((edge) => ({ ...edge }));

  const simulation = forceSimulation(nodes)
    .force("charge", forceManyBody().strength(-100))
    .force("center", forceCenter(VIEWBOX_WIDTH / 2, VIEWBOX_HEIGHT / 2).strength(0.2))
    .force("collide", forceCollide().radius(30))
    .force(
      "link",
      forceLink(links)
        .id((node) => node.id)
        .distance(120)
    )
    .stop();

  for (let index = 0; index < 180; index += 1) {
    simulation.tick();
  }

  simulation.stop();
  return {
    nodes: fitNodes(nodes),
    edges: links,
  };
}

function nodeRadius(node) {
  if (node.type === "document") {
    return 18;
  }
  if (node.type === "collection") {
    return 16;
  }
  if (node.type === "topic") {
    return 14;
  }
  return 10;
}

function isConnected(nodeId, focusedNodeId, edges) {
  if (!focusedNodeId) {
    return true;
  }
  if (nodeId === focusedNodeId) {
    return true;
  }
  return edges.some(
    (edge) =>
      ((edge.source.id || edge.source) === focusedNodeId &&
        (edge.target.id || edge.target) === nodeId) ||
      ((edge.target.id || edge.target) === focusedNodeId &&
        (edge.source.id || edge.source) === nodeId)
  );
}

function KnowledgeGraphPage({ workspaceId, documents, onSelectNode }) {
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [graph, setGraph] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState("graph");
  const [focusedNodeId, setFocusedNodeId] = useState("");
  const [layout, setLayout] = useState({ nodes: [], edges: [] });

  useEffect(() => {
    if (window.innerWidth <= 768) {
      setViewMode("list");
    }
  }, []);

  useEffect(() => {
    const availableIds = new Set((documents || []).map((document) => document.document_id));
    setSelectedDocumentIds((current) => current.filter((documentId) => availableIds.has(documentId)));
  }, [documents]);

  useEffect(() => {
    if (!workspaceId || !selectedDocumentIds.length) {
      setGraph(null);
      setLayout({ nodes: [], edges: [] });
      setFocusedNodeId("");
      setErrorMessage("");
      onSelectNode?.(null);
      return;
    }

    let cancelled = false;

    async function loadGraph() {
      try {
        setIsLoading(true);
        setErrorMessage("");
        const response = await fetchDocumentGraph(workspaceId, selectedDocumentIds);
        if (cancelled) {
          return;
        }
        setGraph(response);
        setLayout(runLayout(response));
      } catch (error) {
        if (cancelled) {
          return;
        }
        setGraph(null);
        setLayout({ nodes: [], edges: [] });
        setErrorMessage(error.message || "Failed to load document graph.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadGraph();
    return () => {
      cancelled = true;
    };
  }, [onSelectNode, selectedDocumentIds, workspaceId]);

  const filteredGraph = useMemo(() => {
    let nodes = layout.nodes;
    let edges = layout.edges;

    if (query.trim()) {
      const normalized = query.trim().toLowerCase();
      nodes = nodes.filter((node) => node.label.toLowerCase().includes(normalized));
      const nodeIds = new Set(nodes.map((node) => node.id));
      edges = edges.filter(
        (edge) =>
          nodeIds.has(edge.source.id || edge.source) ||
          nodeIds.has(edge.target.id || edge.target)
      );
      nodes = layout.nodes.filter((node) => {
        const nodeId = node.id;
        return (
          nodeIds.has(nodeId) ||
          edges.some(
            (edge) =>
              (edge.source.id || edge.source) === nodeId ||
              (edge.target.id || edge.target) === nodeId
          )
        );
      });
    }

    return { nodes, edges };
  }, [layout.edges, layout.nodes, query]);

  const hasSharedRelationships = Boolean(graph?.meta?.has_shared_relationships);

  function toggleDocument(documentId) {
    setSelectedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((item) => item !== documentId)
        : [...current, documentId]
    );
    setFocusedNodeId("");
    onSelectNode?.(null);
  }

  return (
    <div className="graph-page">
      <div className="graph-selector">
        <div>
          <p className="sidebar-group-title">Knowledge Map</p>
          <h4>Choose documents to explore</h4>
          <p className="subtle-copy">
            Select one or more documents to visualize their topics, entities, and shared concepts.
          </p>
        </div>

        <div className="graph-document-pills">
          {(documents || []).map((document) => (
            <button
              key={document.document_id}
              type="button"
              className={`document-pill ${selectedDocumentIds.includes(document.document_id) ? "active" : ""}`}
              onClick={() => toggleDocument(document.document_id)}
            >
              {document.file_name}
            </button>
          ))}
        </div>
      </div>

      <div className="graph-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search nodes..."
          disabled={!selectedDocumentIds.length}
        />
        <div className="graph-toggles">
          <button
            type="button"
            className={`secondary-button ${viewMode === "graph" ? "active-toggle" : ""}`}
            onClick={() => setViewMode("graph")}
            disabled={!selectedDocumentIds.length}
          >
            Graph View
          </button>
          <button
            type="button"
            className={`secondary-button ${viewMode === "list" ? "active-toggle" : ""}`}
            onClick={() => setViewMode("list")}
            disabled={!selectedDocumentIds.length}
          >
            List View
          </button>
          {focusedNodeId ? (
            <button type="button" className="secondary-button" onClick={() => setFocusedNodeId("")}>
              Reset focus
            </button>
          ) : null}
        </div>
      </div>

      <div className="graph-legend">
        <span><i className="legend-swatch collection" /> Collection</span>
        <span><i className="legend-swatch document" /> Document</span>
        <span><i className="legend-swatch topic" /> Topic</span>
        <span><i className="legend-swatch entity" /> Entity</span>
      </div>

      {!selectedDocumentIds.length ? (
        <div className="graph-empty">
          <div>
            <strong>Knowledge Map</strong>
            <p>Select one or more documents to explore their relationships.</p>
          </div>
        </div>
      ) : errorMessage ? (
        <div className="graph-empty">
          <div>
            <strong>Could not load the knowledge map.</strong>
            <p>{errorMessage}</p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="graph-empty">Building document graph...</div>
      ) : viewMode === "graph" ? (
        <>
          <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} className="graph-svg">
            <defs>
              <pattern id="graphGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(148, 163, 184, 0.14)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="url(#graphGrid)" />

            {filteredGraph.edges.map((edge, index) => {
              const sourceId = edge.source.id || edge.source;
              const targetId = edge.target.id || edge.target;
              const source = filteredGraph.nodes.find((node) => node.id === sourceId);
              const target = filteredGraph.nodes.find((node) => node.id === targetId);
              if (!source || !target) {
                return null;
              }

              const muted = focusedNodeId && !(source.id === focusedNodeId || target.id === focusedNodeId);
              return (
                <line
                  key={`${sourceId}-${targetId}-${index}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={muted ? "rgba(203, 213, 225, 0.35)" : "rgba(148, 163, 184, 0.7)"}
                  strokeWidth="1.6"
                />
              );
            })}

            {filteredGraph.nodes.map((node) => {
              const active = isConnected(node.id, focusedNodeId, filteredGraph.edges);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="graph-node"
                  style={{ opacity: active ? 1 : 0.24 }}
                  onClick={() => {
                    setFocusedNodeId(node.id);
                    onSelectNode?.(node);
                  }}
                >
                  {node.type === "document" || node.type === "collection" ? (
                    <rect
                      x={-60}
                      y={-18}
                      rx="12"
                      width="120"
                      height="36"
                      fill={NODE_COLORS[node.type]}
                      stroke={node.type === "collection" ? "#93c5fd" : "#bfdbfe"}
                    />
                  ) : (
                    <circle
                      r={nodeRadius(node)}
                      fill={NODE_COLORS[node.type]}
                      stroke="#e5e7eb"
                    />
                  )}
                  <text
                    y={node.type === "document" ? 5 : 30}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#111827"
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {!hasSharedRelationships && selectedDocumentIds.length > 1 ? (
            <div className="graph-helper">
              No shared concepts found between these documents. You are seeing separate clusters.
            </div>
          ) : null}
        </>
      ) : (
        <div className="graph-list">
          {filteredGraph.nodes.map((node) => (
            <button
              type="button"
              key={node.id}
              className="graph-list-row"
              onClick={() => {
                setFocusedNodeId(node.id);
                onSelectNode?.(node);
              }}
            >
              <span className={`graph-node-type ${node.type}`}>{node.type}</span>
              <strong>{node.label}</strong>
            </button>
          ))}
          {!filteredGraph.nodes.length ? (
            <div className="graph-empty">No graph nodes match this filter.</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default KnowledgeGraphPage;
