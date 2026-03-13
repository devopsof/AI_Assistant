import { Copy, Expand, FileText } from "lucide-react";

function SourceViewer({ source, onOpenDocument }) {
  if (!source) {
    return (
      <div className="panel-stack">
        <div className="panel-header">
          <div>
            <p className="panel-kicker">Context</p>
            <h3>Sources</h3>
          </div>
        </div>
        <p className="muted">
          Click a source below any assistant message to inspect the retrieved document context.
        </p>
      </div>
    );
  }

  async function handleCopyChunk() {
    await navigator.clipboard.writeText(source.chunk_text || "");
  }

  const score = Math.max(0, Math.min(Number(source.similarity_score || 0), 1));

  return (
    <div className="panel-stack">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Workspace &gt; Collection &gt; Document</p>
          <h3>{source.document} &gt; Chunk {source.chunk_index || source.chunk}</h3>
        </div>
        <div className="drawer-header-actions">
          <button type="button" className="ghost-button" onClick={handleCopyChunk}>
            <Copy size={15} />
            Copy chunk
          </button>
          {source.document_id ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => onOpenDocument?.(source.document_id)}
            >
              <Expand size={15} />
              View full document
            </button>
          ) : null}
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Chunk</span>
          <strong>{source.chunk_index || source.chunk}</strong>
        </div>
        <div className="metric-card">
          <span>Similarity</span>
          <strong>{Number(source.similarity_score || 0).toFixed(4)}</strong>
          <div className="score-bar">
            <div className="score-bar-fill" style={{ width: `${score * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="source-meta-card">
        <div>
          <span>Collection</span>
          <strong>{source.collection_name || "General"}</strong>
        </div>
        <div>
          <span>Upload date</span>
          <strong>{source.upload_timestamp ? new Date(source.upload_timestamp).toLocaleDateString() : "Unknown"}</strong>
        </div>
        <div>
          <span>File</span>
          <strong>{source.document}</strong>
        </div>
        <div>
          <span>Chunk</span>
          <strong>{source.chunk_index || source.chunk}</strong>
        </div>
      </div>

      {source.previous_chunk_text ? (
        <div className="context-block">
          <p className="panel-kicker">Previous chunk</p>
          <p>{source.previous_chunk_text}</p>
        </div>
      ) : null}

      <div className="context-block active">
        <p className="panel-kicker">Current chunk</p>
        <p>{source.chunk_text || "Chunk text unavailable."}</p>
      </div>

      {source.next_chunk_text ? (
        <div className="context-block">
          <p className="panel-kicker">Next chunk</p>
          <p>{source.next_chunk_text}</p>
        </div>
      ) : null}

      <div className="chunk-nav">
        <button type="button" className="ghost-button" disabled={!source.previous_chunk_text}>
          &lt; Previous
        </button>
        <button type="button" className="ghost-button" disabled={!source.next_chunk_text}>
          Next &gt;
        </button>
      </div>
    </div>
  );
}

export default SourceViewer;
