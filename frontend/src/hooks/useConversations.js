import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchConversations,
  fetchConversationMessages,
  streamKnowledgeQuery,
} from "../services/api";

const STORAGE_PREFIX = "knowledge_assistant_conversations:";

function createLocalConversation() {
  return {
    localId: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    conversationId: "",
    title: "New chat",
    updatedAt: new Date().toISOString(),
    sessionId: "",
    messages: [],
  };
}

function readPersistedState(workspaceId) {
  if (!workspaceId) return { conversations: [], activeId: "" };
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${workspaceId}`);
    if (!raw) return { conversations: [], activeId: "" };
    const parsed = JSON.parse(raw);
    if (!parsed.conversations || !parsed.conversations.length) return { conversations: [], activeId: "" };
    return {
      conversations: parsed.conversations,
      activeId: parsed.activeId || parsed.conversations[0].localId,
    };
  } catch (_error) {
    return { conversations: [], activeId: "" };
  }
}

function deriveTitle(messages) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "New chat";
  return firstUser.content.length > 32 ? `${firstUser.content.slice(0, 32)}...` : firstUser.content;
}

export function useConversations(activeWorkspaceId, onComposerStatus) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationLocalId, setActiveConversationLocalId] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const pendingLoadRef = useRef(false);

  const activeConversation =
    conversations.find((conv) => conv.localId === activeConversationLocalId) ||
    conversations[0] ||
    null;

  useEffect(() => {
    if (!activeWorkspaceId) {
      setConversations([]);
      setActiveConversationLocalId("");
      return;
    }
    const saved = readPersistedState(activeWorkspaceId);
    setConversations(saved.conversations);
    setActiveConversationLocalId(saved.activeId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${activeWorkspaceId}`,
      JSON.stringify({ activeId: activeConversationLocalId, conversations })
    );
  }, [activeConversationLocalId, activeWorkspaceId, conversations]);

  useEffect(() => {
    if (!activeWorkspaceId || pendingLoadRef.current) return;
    pendingLoadRef.current = true;
    fetchConversations(activeWorkspaceId)
      .then((data) => {
        const backendConversations = data.conversations || [];
        setConversations((current) => {
          const byBackendId = new Map(
            current
              .filter((item) => item.conversationId)
              .map((item) => [item.conversationId, item])
          );
          const merged = backendConversations.map((backend) => {
            const existing = byBackendId.get(backend.conversation_id);
            if (existing) {
              return {
                ...existing,
                sessionId: backend.session_id || existing.sessionId,
                updatedAt: backend.updated_at || existing.updatedAt,
              };
            }
            return {
              localId: `chat_${backend.conversation_id}`,
              conversationId: backend.conversation_id,
              title: "New chat",
              updatedAt: backend.updated_at || new Date().toISOString(),
              sessionId: backend.session_id || "",
              messages: [],
            };
          });
          const localOnly = current.filter((item) => !item.conversationId);
          return [...localOnly, ...merged];
        });
      })
      .catch((error) => {
        if (onComposerStatus) onComposerStatus(error.message);
      })
      .finally(() => {
        pendingLoadRef.current = false;
      });
  }, [activeWorkspaceId, onComposerStatus]);

  const updateConversation = useCallback((localId, updater) => {
    setConversations((current) =>
      current.map((conv) => (conv.localId === localId ? updater(conv) : conv))
    );
  }, []);

  const updateLastAssistant = useCallback((conversation, updater) => {
    const messages = [...conversation.messages];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        messages[i] = updater(messages[i]);
        break;
      }
    }
    return { ...conversation, messages };
  }, []);

  const submitQuestion = useCallback(
    async (content, workspaceId, onSelectSource) => {
      if (!content || !workspaceId || !activeConversationLocalId) {
        return;
      }

      const timestamp = new Date().toISOString();
      const userMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "user",
        content,
        timestamp,
      };
      const assistantMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp,
        sources: [],
        insights: [],
        themes: [],
      };

      setIsThinking(true);
      setLoadingStage("Retrieving sources...");

      updateConversation(activeConversationLocalId, (conv) => {
        const nextMessages = [...conv.messages, userMessage, assistantMessage];
        return {
          ...conv,
          messages: nextMessages,
          title: conv.title && conv.title !== "New chat" ? conv.title : deriveTitle(nextMessages),
          updatedAt: timestamp,
        };
      });

      const activeConversationRecord =
        conversations.find((conv) => conv.localId === activeConversationLocalId) || null;
      const conversationId = activeConversationRecord?.conversationId || "";

      try {
        await streamKnowledgeQuery(
          workspaceId,
          content,
          conversationId,
          {
            onMeta: (payload) => {
              const sessionStorageKey = `session_id:${workspaceId}`;
              if (payload.session_id) {
                window.sessionStorage.setItem(sessionStorageKey, payload.session_id);
              }

              updateConversation(activeConversationLocalId, (conv) => {
                const updated = updateLastAssistant(conv, (assistant) => ({
                  ...assistant,
                  sources: payload.sources || assistant.sources,
                  insights: payload.insights || assistant.insights,
                  themes: payload.themes || assistant.themes,
                  rewrittenQuery: payload.rewritten_query || assistant.rewrittenQuery,
                }));
                return {
                  ...updated,
                  conversationId: payload.conversation_id || conv.conversationId,
                  sessionId: payload.session_id || conv.sessionId,
                };
              });
            },
            onChunk: ({ delta }) => {
              if (!delta) return;
              setLoadingStage("Generating answer...");
              updateConversation(activeConversationLocalId, (conv) =>
                updateLastAssistant(conv, (assistant) => ({
                  ...assistant,
                  content: `${assistant.content || ""}${delta}`,
                  isStreaming: true,
                }))
              );
            },
            onDone: (payload) => {
              setIsThinking(false);
              setLoadingStage("");
              if (payload.sources && payload.sources.length > 0 && onSelectSource) {
                onSelectSource(payload.sources[0]);
              }
              updateConversation(activeConversationLocalId, (conv) => ({
                ...updateLastAssistant(conv, (assistant) => ({
                  ...assistant,
                  content: payload.answer || assistant.content,
                  isStreaming: false,
                  sources: payload.sources || assistant.sources,
                  confidence: payload.confidence,
                  suggestions: payload.suggestions || [],
                  debug: payload.debug,
                  insights: payload.insights || [],
                  themes: payload.themes || [],
                  rewrittenQuery: payload.rewritten_query || assistant.rewrittenQuery,
                })),
                conversationId: payload.conversation_id || conv.conversationId,
                sessionId: payload.session_id || conv.sessionId,
                updatedAt: new Date().toISOString(),
              }));
            },
          }
        );
      } catch (error) {
        setIsThinking(false);
        setLoadingStage("");
        if (onComposerStatus) onComposerStatus(error.message);
        updateConversation(activeConversationLocalId, (conv) =>
          updateLastAssistant(conv, (assistant) => ({
            ...assistant,
            content: assistant.content || "Something went wrong. Please try again.",
            isStreaming: false,
          }))
        );
      }
    },
    [
      activeConversationLocalId,
      conversations,
      onComposerStatus,
      updateConversation,
      updateLastAssistant,
    ]
  );

  const createNewChat = useCallback(() => {
    if (!activeWorkspaceId) return null;
    const conversation = createLocalConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationLocalId(conversation.localId);
    return conversation;
  }, [activeWorkspaceId]);

  const hydrateConversation = useCallback(
    async (localId) => {
      const target = conversations.find((conv) => conv.localId === localId);
      if (!target || !target.conversationId || target.messages.length) return;
      try {
        const data = await fetchConversationMessages(activeWorkspaceId, target.conversationId);
        const messages = data.messages || [];
        updateConversation(localId, (conv) => ({
          ...conv,
          messages,
          title: deriveTitle(messages),
        }));
      } catch (error) {
        if (onComposerStatus) onComposerStatus(error.message);
      }
    },
    [activeWorkspaceId, conversations, onComposerStatus, updateConversation]
  );

  const clearWorkspaceConversations = useCallback((workspaceId) => {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${workspaceId}`);
  }, []);

  return {
    conversations,
    activeConversation,
    activeConversationLocalId,
    setActiveConversationLocalId,
    updateConversation,
    createNewChat,
    hydrateConversation,
    clearWorkspaceConversations,
    submitQuestion,
    isThinking,
    loadingStage,
  };
}
