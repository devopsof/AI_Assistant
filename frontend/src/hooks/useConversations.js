import { useCallback, useEffect, useRef, useState } from "react";
import { streamKnowledgeQuery } from "../services/api";

const STORAGE_PREFIX = "knowledge_assistant_conversations:";

function createLocalConversation() {
    return {
        localId: "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        title: "New chat",
        updatedAt: new Date().toISOString(),
        sessionId: "",
        messages: [],
    };
}

function readPersistedState(workspaceId) {
    if (!workspaceId) return { conversations: [], activeId: "" };
    try {
        var raw = window.localStorage.getItem(STORAGE_PREFIX + workspaceId);
        if (!raw) return { conversations: [], activeId: "" };
        var parsed = JSON.parse(raw);
        if (!parsed.conversations || !parsed.conversations.length) return { conversations: [], activeId: "" };
        return {
            conversations: parsed.conversations,
            activeId: parsed.activeId || parsed.conversations[0].localId,
        };
    } catch (_) {
        return { conversations: [], activeId: "" };
    }
}

function truncate(value, length) {
    var len = length || 34;
    if (!value) return "";
    return value.length > len ? value.slice(0, len) + "..." : value;
}

export function useConversations(activeWorkspaceId, onComposerStatus) {
    var _useState = useState([]);
    var conversations = _useState[0];
    var setConversations = _useState[1];

    var _useState2 = useState("");
    var activeConversationLocalId = _useState2[0];
    var setActiveConversationLocalId = _useState2[1];

    var _useState3 = useState(false);
    var isThinking = _useState3[0];
    var setIsThinking = _useState3[1];

    var _useState4 = useState("Assistant is thinking...");
    var loadingStage = _useState4[0];
    var setLoadingStage = _useState4[1];

    var stageTimerRef = useRef(null);

    var activeConversation =
        conversations.find(function(c) { return c.localId === activeConversationLocalId; }) ||
        conversations[0] ||
        null;

    useEffect(function() {
        if (!activeWorkspaceId) {
            setConversations([]);
            setActiveConversationLocalId("");
            return;
        }
        var saved = readPersistedState(activeWorkspaceId);
        setConversations(saved.conversations);
        setActiveConversationLocalId(saved.activeId);
    }, [activeWorkspaceId]);

    useEffect(function() {
        if (!activeWorkspaceId) return;
        window.localStorage.setItem(
            STORAGE_PREFIX + activeWorkspaceId,
            JSON.stringify({ activeId: activeConversationLocalId, conversations: conversations })
        );
    }, [activeConversationLocalId, activeWorkspaceId, conversations]);

    var updateConversation = useCallback(function(localId, updater) {
        setConversations(function(prev) {
            return prev.map(function(c) { return c.localId === localId ? updater(c) : c; });
        });
    }, []);

    var createNewChat = useCallback(function() {
        if (!activeWorkspaceId) return null;
        var conversation = createLocalConversation();
        setConversations(function(prev) { return [conversation].concat(prev); });
        setActiveConversationLocalId(conversation.localId);
        return conversation;
    }, [activeWorkspaceId]);

    var clearWorkspaceConversations = useCallback(function(workspaceId) {
        window.localStorage.removeItem(STORAGE_PREFIX + workspaceId);
    }, []);

    var submitQuestion = useCallback(
        async function(content, workspaceId, setSelectedSource) {
            if (!content.trim() || !workspaceId || isThinking) return;

            var localConversationId = activeConversation ? activeConversation.localId : null;
            if (!localConversationId) {
                if (onComposerStatus) onComposerStatus("Start a new chat in this workspace first");
                return;
            }

            var assistantMessageId = "assistant_" + Date.now();
            if (onComposerStatus) onComposerStatus("");

            updateConversation(localConversationId, function(conv) {
                return Object.assign({}, conv, {
                    title: conv.messages.length === 0 ? truncate(content, 32) : conv.title,
                    updatedAt: new Date().toISOString(),
                    messages: conv.messages.concat([
                        { id: "user_" + Date.now(), role: "user", content: content },
                        {
                            id: assistantMessageId,
                            role: "assistant",
                            content: "",
                            sources: [],
                            suggestions: [],
                            confidence: null,
                            rewrittenQuery: "",
                            debug: null,
                            insights: [],
                            themes: [],
                            isStreaming: true,
                        },
                    ]),
                });
            });

            setIsThinking(true);
            setLoadingStage("Assistant is thinking...");
            if (stageTimerRef.current) window.clearInterval(stageTimerRef.current);
            stageTimerRef.current = window.setInterval(function() {
                setLoadingStage(function(prev) {
                    return prev === "Assistant is thinking..." ? "Searching documents..." : "Assistant is thinking...";
                });
            }, 1100);

            try {
                await streamKnowledgeQuery(workspaceId, content, activeConversation.localId, {
                    onMeta: function(meta) {
                        if (meta.session_id) {
                            window.sessionStorage.setItem("session_id:" + workspaceId, meta.session_id);
                        }
                        updateConversation(localConversationId, function(conv) {
                            return Object.assign({}, conv, {
                                sessionId: meta.session_id || conv.sessionId,
                                updatedAt: new Date().toISOString(),
                                messages: conv.messages.map(function(msg) {
                                    if (msg.id !== assistantMessageId) return msg;
                                    return Object.assign({}, msg, {
                                        sources: (meta.sources || []).map(function(s) {
                                            return Object.assign({}, s, { workspace_id: workspaceId });
                                        }),
                                        insights: meta.insights || [],
                                        themes: meta.themes || [],
                                    });
                                }),
                            });
                        });
                    },

                    onChunk: function(chunk) {
                        var delta = chunk.delta || "";
                        updateConversation(localConversationId, function(conv) {
                            return Object.assign({}, conv, {
                                messages: conv.messages.map(function(msg) {
                                    if (msg.id !== assistantMessageId) return msg;
                                    return Object.assign({}, msg, { content: (msg.content || "") + delta });
                                }),
                            });
                        });
                    },

                    onDone: function(response) {
                        if (response.session_id) {
                            window.sessionStorage.setItem("session_id:" + workspaceId, response.session_id);
                        }
                        updateConversation(localConversationId, function(conv) {
                            return Object.assign({}, conv, {
                                sessionId: response.session_id,
                                updatedAt: new Date().toISOString(),
                                messages: conv.messages.map(function(msg) {
                                    if (msg.id !== assistantMessageId) return msg;
                                    return Object.assign({}, msg, {
                                        content: response.answer,
                                        sources: (response.sources || []).map(function(s) {
                                            return Object.assign({}, s, { workspace_id: workspaceId });
                                        }),
                                        suggestions: response.suggestions || [],
                                        confidence: response.confidence,
                                        rewrittenQuery: response.rewritten_query,
                                        debug: response.debug,
                                        insights: response.insights || [],
                                        themes: response.themes || [],
                                        isStreaming: false,
                                    });
                                }),
                            });
                        });

                        if (response.sources && response.sources.length && setSelectedSource) {
                            setSelectedSource(Object.assign({}, response.sources[0], { workspace_id: workspaceId }));
                        }
                    },
                });
            } catch (err) {
                updateConversation(localConversationId, function(conv) {
                    return Object.assign({}, conv, {
                        messages: conv.messages.filter(function(msg) { return msg.id !== assistantMessageId; }),
                    });
                });
                if (onComposerStatus) onComposerStatus(err.message);
            } finally {
                if (stageTimerRef.current) window.clearInterval(stageTimerRef.current);
                setIsThinking(false);
                setLoadingStage("Assistant is thinking...");
            }
        }, [activeConversation, isThinking, onComposerStatus, updateConversation]
    );

    return {
        conversations: conversations,
        activeConversation: activeConversation,
        activeConversationLocalId: activeConversationLocalId,
        setActiveConversationLocalId: setActiveConversationLocalId,
        isThinking: isThinking,
        loadingStage: loadingStage,
        createNewChat: createNewChat,
        clearWorkspaceConversations: clearWorkspaceConversations,
        submitQuestion: submitQuestion,
    };
}