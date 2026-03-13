import { Children, cloneElement, isValidElement, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, RefreshCcw, ThumbsDown, ThumbsUp, UserRound } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

function renderCitationChildren(children, sources, onSelectSource) {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return child.split(/(\[\d+\])/g).map((segment, index) => {
        const match = segment.match(/^\[(\d+)\]$/);
        if (!match) {
          return segment;
        }
        const source = sources[Number(match[1]) - 1];
        if (!source) {
          return segment;
        }
        return (
          <button
            type="button"
            key={`${segment}-${index}`}
            className="inline-citation"
            onClick={() => onSelectSource?.(source)}
          >
            {segment}
          </button>
        );
      });
    }

    if (isValidElement(child) && child.props?.children) {
      return cloneElement(child, {
        ...child.props,
        children: renderCitationChildren(child.props.children, sources, onSelectSource),
      });
    }

    return child;
  });
}

function MessageBubble({
  message,
  onSelectSource,
  onRegenerate,
  isLastAssistantMessage = false,
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState("");
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
    timestamp,
  } = message;

  const formattedTime = useMemo(() => {
    if (!timestamp) {
      return "";
    }
    return new Date(timestamp).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }, [timestamp]);

  async function handleCopy() {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <motion.article
      className={`message-shell ${role}`}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`message-avatar ${role}`}>
        {role === "assistant" ? <span>KA</span> : <UserRound size={15} />}
      </div>
      <div className={`message-bubble ${role}`}>
        <div className="message-topline">
          <p className="message-role">{role === "assistant" ? "Knowledge Assistant" : "You"}</p>
          {formattedTime ? <span className="message-timestamp">{formattedTime}</span> : null}
          {role === "assistant" ? (
            <div className="message-actions">
              <button type="button" className="icon-chip" onClick={handleCopy} aria-label="Copy answer">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
              {isLastAssistantMessage ? (
                <button
                  type="button"
                  className="icon-chip"
                  onClick={() => onRegenerate?.(message)}
                  aria-label="Regenerate answer"
                >
                  <RefreshCcw size={15} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="message-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p({ children, ...props }) {
                return <p {...props}>{renderCitationChildren(children, sources, onSelectSource)}</p>;
              },
              li({ children, ...props }) {
                return <li {...props}>{renderCitationChildren(children, sources, onSelectSource)}</li>;
              },
              td({ children, ...props }) {
                return <td {...props}>{renderCitationChildren(children, sources, onSelectSource)}</td>;
              },
              code({ inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "");
                if (inline) {
                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
                return (
                  <SyntaxHighlighter
                    style={oneLight}
                    language={match?.[1] || "text"}
                    PreTag="div"
                    customStyle={{ margin: 0, borderRadius: "14px", padding: "14px" }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                );
              },
            }}
          >
            {content || (isStreaming ? "..." : "")}
          </ReactMarkdown>
          {isStreaming ? <span className="streaming-cursor" /> : null}
        </div>

        {role === "assistant" ? (
          <div className="message-meta">
            {typeof confidence === "number" ? <span>Confidence {Math.round(confidence * 100)}%</span> : null}
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

        {role === "assistant" ? (
          <div className="feedback-row">
            <button
              type="button"
              className={`icon-chip ${feedback === "up" ? "active" : ""}`}
              onClick={() => setFeedback((current) => (current === "up" ? "" : "up"))}
              aria-label="Helpful response"
            >
              <ThumbsUp size={15} />
            </button>
            <button
              type="button"
              className={`icon-chip ${feedback === "down" ? "active" : ""}`}
              onClick={() => setFeedback((current) => (current === "down" ? "" : "down"))}
              aria-label="Not helpful response"
            >
              <ThumbsDown size={15} />
            </button>
          </div>
        ) : null}

        {sources.length > 0 ? (
          <div className="source-pill-row">
            {sources.map((source, index) => (
              <button
                type="button"
                key={`${source.document_id}-${source.chunk}-${source.chunk_index}`}
                className="source-pill"
                onClick={() => onSelectSource?.(source)}
              >
                [{index + 1}] {source.document} • {source.chunk}
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
