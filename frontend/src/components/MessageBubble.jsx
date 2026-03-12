import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MessageBubble({ message, onSelectSource }) {
  const {
    role,
    content,
    sources = [],
    confidence,
    suggestions = [],
    rewrittenQuery,
    isStreaming,
    insights = [],
    themes = [],
  } = message;

  return (
    <motion.article
      className={`message-shell ${role}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`message-bubble ${role}`}>
        <p className="message-role">{role === "assistant" ? "Knowledge Assistant" : "You"}</p>
        <div className="message-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || (isStreaming ? "..." : "")}
          </ReactMarkdown>
        </div>

        {role === "assistant" ? (
          <div className="message-meta">
            {typeof confidence === "number" ? <span>Confidence {confidence}</span> : null}
            {rewrittenQuery ? <span>Interpreted as: {rewrittenQuery}</span> : null}
          </div>
        ) : null}

        {role === "assistant" && themes.length > 0 ? (
          <div className="insight-section">
            <p className="message-role">Themes</p>
            <div className="suggestion-row">
              {themes.map((theme) => (
                <span key={theme} className="suggestion-pill">
                  {theme}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {role === "assistant" && insights.length > 0 ? (
          <div className="insight-section">
            <p className="message-role">Key Insights</p>
            <div className="insight-list">
              {insights.map((insight) => (
                <div key={insight.theme} className="insight-card">
                  <strong>{insight.theme}</strong>
                  <p>{(insight.key_points || []).join(" ")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="source-pill-row">
            {sources.map((source) => (
              <button
                type="button"
                key={`${source.document_id}-${source.chunk}-${source.chunk_index}`}
                className="source-pill"
                onClick={() => onSelectSource?.(source)}
              >
                {source.document} • {source.chunk}
              </button>
            ))}
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <div className="suggestion-row">
            {suggestions.map((suggestion) => (
              <span key={suggestion} className="suggestion-pill">
                {suggestion}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

export default MessageBubble;
