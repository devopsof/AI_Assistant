import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { Lightbulb, Search, Sparkles } from "lucide-react";
import MessageBubble from "./MessageBubble";

function ChatWindow({
  messages,
  isThinking,
  loadingStage,
  onSelectSource,
  onRegenerate,
  examplePrompts = [],
  onPickExample,
  onUploadToChat,
  onAskKnowledgeBase,
  useGlobalKnowledge = false,
}) {
  const endRef = useRef(null);
  const exampleIcons = [Sparkles, Search, Lightbulb];

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
            You can upload documents to this chat, or ask questions across your entire knowledge base.
          </p>
          <div className="empty-chat-actions">
            <button type="button" className="primary-button" onClick={() => onUploadToChat?.()}>
              Upload to this chat
            </button>
            <button
              type="button"
              className={`secondary-button ${useGlobalKnowledge ? "active-toggle" : ""}`}
              onClick={() => onAskKnowledgeBase?.()}
            >
              Ask about my knowledge base
            </button>
          </div>
          <div className="example-prompt-list">
            {examplePrompts.map((prompt, index) => {
              const Icon = exampleIcons[index % exampleIcons.length];
              return (
              <button
                type="button"
                key={prompt}
                className="example-prompt"
                onClick={() => onPickExample?.(prompt)}
              >
                <Icon size={15} />
                {prompt}
              </button>
              );
            })}
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id || `${message.role}-${index}`}
              message={message}
              onSelectSource={onSelectSource}
              onRegenerate={onRegenerate}
              isLastAssistantMessage={
                message.role === "assistant" &&
                index === messages.map((item) => item.role).lastIndexOf("assistant")
              }
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
