function DebugPanel({ debug }) {
  if (!debug) {
    return null;
  }

  return (
    <section className="debug-panel">
      <div className="panel-header compact">
        <div>
          <p className="panel-kicker">Developer mode</p>
          <h3>Retrieval diagnostics</h3>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Vector</span>
          <strong>{debug.vector_retrieval_ms} ms</strong>
        </div>
        <div className="metric-card">
          <span>Keyword</span>
          <strong>{debug.keyword_retrieval_ms} ms</strong>
        </div>
        <div className="metric-card">
          <span>Re-rank</span>
          <strong>{debug.retrieval_latency_ms} ms</strong>
        </div>
        <div className="metric-card">
          <span>LLM</span>
          <strong>{debug.llm_latency_ms} ms</strong>
        </div>
        <div className="metric-card">
          <span>Synthesis</span>
          <strong>{debug.synthesis_time_ms || 0} ms</strong>
        </div>
      </div>

      {debug.themes_detected?.length ? (
        <div className="debug-tags">
          {debug.themes_detected.map((theme) => (
            <span key={theme} className="document-tag">
              {theme}
            </span>
          ))}
        </div>
      ) : null}

      <div className="debug-list">
        {(debug.selected_chunks || []).map((item, index) => (
          <div key={`${item.document}-${item.chunk}-${index}`} className="debug-row">
            <span>{item.document}</span>
            <span>{item.chunk}</span>
            <span>{item.combined_score}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default DebugPanel;
