import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";

function ChatWindow({
  messages,
  isThinking,
  loadingStage,
  onSelectSource,
  examplePrompts = [],
  onPickExample,
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking]);

  return (
    <section className="chat-window">
      {messages.length === 0 ? (
        <div className="empty-chat">
          <p className="panel-kicker">Start a conversation</p>
          <h2>Ask questions about your documents.</h2>
          <p className="muted">
            Upload files to start building your knowledge base and ask grounded questions.
          </p>
          <div className="example-prompt-list">
            {examplePrompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                className="example-prompt"
                onClick={() => onPickExample?.(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id || `${message.role}-${index}`}
              message={message}
              onSelectSource={onSelectSource}
            />
          ))}
        </AnimatePresence>
      )}

      {isThinking ? (
        <div className="thinking-row">
          <span>{loadingStage || "Assistant is thinking..."}</span>
          <div className="typing-dots">
            <span />
            <span />
            <span />
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </section>
  );
}

export default ChatWindow;
