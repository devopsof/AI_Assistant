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

  return (
    <div className="panel-stack">
      <div className="panel-header">
        <div>
          <p className="panel-kicker">Context</p>
          <h3>{source.document}</h3>
        </div>
        {source.document_id ? (
          <button
            type="button"
            className="ghost-button"
            onClick={() => onOpenDocument?.(source.document_id)}
          >
            View full document
          </button>
        ) : null}
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Chunk</span>
          <strong>{source.chunk_index || source.chunk}</strong>
        </div>
        <div className="metric-card">
          <span>Similarity</span>
          <strong>{Number(source.similarity_score || 0).toFixed(4)}</strong>
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
    </div>
  );
}

export default SourceViewer;
