import { useState } from "react";
import ChatWindow from "../components/ChatWindow";
import DebugPanel from "../components/DebugPanel";
import SearchPanel from "../components/SearchPanel";
import { queryKnowledge } from "../services/api";

function ChatPage({ workspaceId }) {
  const [question, setQuestion] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [sessionId, setSessionId] = useState(
    () => window.sessionStorage.getItem(`session_id:${workspaceId}`) || ""
  );
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState("");
  const [showDebug, setShowDebug] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }

    const content = question.trim();
    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", content, sources: [] }]);
    setIsThinking(true);

    try {
      const response = await queryKnowledge(workspaceId, content, conversationId);
      setConversationId(response.conversation_id);
      setSessionId(response.session_id);
      window.sessionStorage.setItem(`session_id:${workspaceId}`, response.session_id);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.answer,
          sources: (response.sources || []).map((source) => ({
            ...source,
            workspace_id: workspaceId,
          })),
          confidence: response.confidence,
          suggestions: response.suggestions || [],
          rewrittenQuery: response.rewritten_query,
          debug: response.debug,
        },
      ]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsThinking(false);
    }
  }

  function handleReset() {
    setConversationId("");
    setMessages([]);
    setError("");
  }

  return (
    <section className="grid">
      <div className="card stack">
        <div className="chat-header">
          <div>
            <h2>Ask AI</h2>
            <p className="muted">
              Ask follow-up questions inside the active workspace and inspect grounded sources.
            </p>
          </div>
          <button type="button" className="button-secondary" onClick={handleReset}>
            New chat
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setShowDebug((current) => !current)}
          >
            {showDebug ? "Hide debug" : "Show debug"}
          </button>
        </div>

        <ChatWindow messages={messages} isThinking={isThinking} />
        {showDebug && messages.length > 0 ? (
          <DebugPanel debug={messages[messages.length - 1].debug} />
        ) : null}

        <form onSubmit={handleSubmit} className="chat-form">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Who developed Kubernetes?"
          />
          <button type="submit" disabled={isThinking}>
            Send
          </button>
        </form>

        {conversationId ? (
          <p className="muted small">Conversation: {conversationId}</p>
        ) : null}
        {sessionId ? <p className="muted small">Session: {sessionId}</p> : null}
        {error ? <p className="status error">{error}</p> : null}
      </div>

      <SearchPanel workspaceId={workspaceId} />
    </section>
  );
}

export default ChatPage;
