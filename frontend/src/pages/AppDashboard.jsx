import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ChevronDown,
  FileText,
  Network,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from "lucide-react";
import ChatWindow from "../components/ChatWindow";
import DebugPanel from "../components/DebugPanel";
import SourceViewer from "../components/SourceViewer";
import {
  API_BASE_URL,
  createCollection,
  createWorkspace,
  deleteCollection,
  deleteDocument,
  deleteWorkspace,
  fetchCollections,
  fetchDocumentPreview,
  fetchDocuments,
  fetchWorkspaceOverview,
  fetchWorkspaces,
  moveDocumentToCollection,
  reindexDocument,
  streamKnowledgeQuery,
  uploadDocument,
} from "../services/api";
import KnowledgeGraphPage from "./KnowledgeGraphPage";
import SettingsPage from "./SettingsPage";

const ACTIVE_WORKSPACE_KEY = "active_workspace_id";
const CONVERSATION_STORAGE_PREFIX = "knowledge_assistant_conversations:";
const EXAMPLE_PROMPTS = [
  "What is Kubernetes?",
  "Summarize my DevOps notes",
  "Explain Docker architecture",
];

function createLocalConversation() {
  return {
    localId: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New chat",
    updatedAt: new Date().toISOString(),
    sessionId: "",
    messages: [],
  };
}

function readConversationState(workspaceId) {
  if (!workspaceId) {
    return { conversations: [], activeId: "" };
  }

  try {
    const raw = window.localStorage.getItem(`${CONVERSATION_STORAGE_PREFIX}${workspaceId}`);
    if (!raw) {
      return { conversations: [], activeId: "" };
    }
    const parsed = JSON.parse(raw);
    if (!parsed.conversations?.length) {
      return { conversations: [], activeId: "" };
    }
    return {
      conversations: parsed.conversations,
      activeId: parsed.activeId || parsed.conversations[0].localId,
    };
  } catch (_error) {
    return { conversations: [], activeId: "" };
  }
}

function formatFileSize(bytes) {
  if (!bytes) {
    return "0 KB";
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateLabel(value, length = 34) {
  if (!value) {
    return "";
  }
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function AppDashboard({ initialPanel = "chat" }) {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    () => window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ""
  );
  const [workspaceName, setWorkspaceName] = useState("");
  const [documents, setDocuments] = useState([]);
  const [collections, setCollections] = useState([]);
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [question, setQuestion] = useState("");
  const [appStatus, setAppStatus] = useState("");
  const [composerStatus, setComposerStatus] = useState("");
  const [isBackendReachable, setIsBackendReachable] = useState(true);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [loadingStage, setLoadingStage] = useState("Assistant is thinking...");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showWorkspaceCreate, setShowWorkspaceCreate] = useState(false);
  const [showCollectionCreate, setShowCollectionCreate] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showKnowledgeMap, setShowKnowledgeMap] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showSettings, setShowSettings] = useState(initialPanel === "settings");
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedGraphNode, setSelectedGraphNode] = useState(null);
  const [preview, setPreview] = useState(null);
  const [workspaceOverview, setWorkspaceOverview] = useState(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationLocalId, setActiveConversationLocalId] = useState("");
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const stageTimerRef = useRef(null);
  const workspaceMenuRef = useRef(null);

  const activeWorkspace = workspaces.find(
    (workspace) => workspace.workspace_id === activeWorkspaceId
  );
  const activeConversation =
    conversations.find((conversation) => conversation.localId === activeConversationLocalId) ||
    conversations[0] ||
    null;
  const activeCollection = collections.find(
    (collection) => collection.collection_id === activeCollectionId
  ) || null;
  const messages = activeConversation?.messages || [];
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content);
  const filteredDocuments = activeCollectionId
    ? documents.filter((document) => document.collection_id === activeCollectionId)
    : documents;

  useEffect(() => {
    loadWorkspaces();
    return () => {
      if (stageTimerRef.current) {
        window.clearInterval(stageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setShowSettings(initialPanel === "settings");
  }, [initialPanel]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target)) {
        setShowWorkspaceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setConversations([]);
      setActiveConversationLocalId("");
      setDocuments([]);
      setCollections([]);
      setActiveCollectionId("");
      return;
    }

    window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    const saved = readConversationState(activeWorkspaceId);
    setConversations(saved.conversations);
    setActiveConversationLocalId(saved.activeId);
    setSelectedSource(null);
    setSelectedGraphNode(null);
    setPreview(null);
    loadDocuments(activeWorkspaceId);
    loadCollections(activeWorkspaceId);
    loadWorkspaceOverview(activeWorkspaceId);
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    window.localStorage.setItem(
      `${CONVERSATION_STORAGE_PREFIX}${activeWorkspaceId}`,
      JSON.stringify({
        activeId: activeConversationLocalId,
        conversations,
      })
    );
  }, [activeConversationLocalId, activeWorkspaceId, conversations]);

  async function loadWorkspaces(preferredWorkspaceId = "") {
    try {
      const data = await fetchWorkspaces();
      const nextWorkspaces = data.workspaces || [];
      setIsBackendReachable(true);
      setWorkspaces(nextWorkspaces);

      const nextActiveWorkspaceId =
        preferredWorkspaceId ||
        (nextWorkspaces.some((workspace) => workspace.workspace_id === activeWorkspaceId)
          ? activeWorkspaceId
          : nextWorkspaces[0]?.workspace_id || "");

      setActiveWorkspaceId(nextActiveWorkspaceId);
      if (!nextActiveWorkspaceId) {
        window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      }
      setAppStatus("");
    } catch (error) {
      setIsBackendReachable(false);
      setWorkspaces([]);
      setActiveWorkspaceId("");
      setDocuments([]);
      setAppStatus(error.message);
      window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    }
  }

  async function loadDocuments(workspaceId) {
    try {
      const data = await fetchDocuments(workspaceId);
      setDocuments(data.documents || []);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function loadCollections(workspaceId) {
    try {
      const data = await fetchCollections(workspaceId);
      const nextCollections = data.collections || [];
      setCollections(nextCollections);
      if (
        activeCollectionId &&
        !nextCollections.some((collection) => collection.collection_id === activeCollectionId)
      ) {
        setActiveCollectionId("");
      }
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function loadWorkspaceOverview(workspaceId) {
    try {
      const data = await fetchWorkspaceOverview(workspaceId);
      setWorkspaceOverview(data);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  function updateConversation(localId, updater) {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.localId === localId ? updater(conversation) : conversation
      )
    );
  }

  function createNewChat() {
    if (!activeWorkspaceId) {
      setAppStatus("Select a workspace before starting a chat");
      return;
    }
    const conversation = createLocalConversation();
    setConversations((current) => [conversation, ...current]);
    setActiveConversationLocalId(conversation.localId);
    setQuestion("");
    setSelectedSource(null);
  }

  async function handleCreateWorkspace(event) {
    event.preventDefault();
    if (!workspaceName.trim()) {
      return;
    }

    try {
      setIsCreatingWorkspace(true);
      const workspace = await createWorkspace(workspaceName.trim());
      setWorkspaceName("");
      setWorkspaces((current) => [...current, workspace]);
      setActiveWorkspaceId(workspace.workspace_id);
      setShowWorkspaceCreate(false);
      setShowWorkspaceMenu(false);
      setAppStatus("Workspace created successfully");
      setIsBackendReachable(true);
    } catch (error) {
      setAppStatus(error.message);
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function handleCreateCollection(event) {
    event.preventDefault();
    if (!collectionName.trim() || !activeWorkspaceId) {
      return;
    }

    try {
      const collection = await createCollection(activeWorkspaceId, collectionName.trim());
      setCollectionName("");
      setCollections((current) => {
        if (current.some((item) => item.collection_id === collection.collection_id)) {
          return current;
        }
        return [...current, collection];
      });
      setActiveCollectionId(collection.collection_id);
      setShowLibrary(true);
      setShowCollectionCreate(false);
      setAppStatus("Collection created");
      await loadWorkspaceOverview(activeWorkspaceId);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleDeleteCollection() {
    if (!activeWorkspaceId || !activeCollectionId || !activeCollection) {
      return;
    }
    const confirmed = window.confirm(
      `Delete collection "${activeCollection.collection_name}"? Documents inside it will move to General.`
    );
    if (!confirmed) {
      return;
    }

    try {
      const response = await deleteCollection(activeWorkspaceId, activeCollectionId);
      setActiveCollectionId("");
      await loadCollections(activeWorkspaceId);
      await loadDocuments(activeWorkspaceId);
      await loadWorkspaceOverview(activeWorkspaceId);
      setShowLibrary(true);
      setAppStatus(`Collection removed. ${response.moved_document_count} document(s) moved to General.`);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleDeleteWorkspace() {
    if (!activeWorkspace || !activeWorkspaceId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete workspace "${activeWorkspace.workspace_name}" and all its documents?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await deleteWorkspace(activeWorkspaceId);
      const remaining = workspaces.filter(
        (workspace) => workspace.workspace_id !== activeWorkspaceId
      );
      setWorkspaces(remaining);
      const fallbackWorkspaceId = remaining[0]?.workspace_id || "";
      setActiveWorkspaceId(fallbackWorkspaceId);
      setSelectedSource(null);
      setShowLibrary(false);
      setShowKnowledgeMap(false);
      setShowSettings(false);
      navigate("/app");
      setShowWorkspaceMenu(false);
      window.localStorage.removeItem(`${CONVERSATION_STORAGE_PREFIX}${activeWorkspaceId}`);
      if (!fallbackWorkspaceId) {
        setDocuments([]);
        setCollections([]);
      }
      setAppStatus("Workspace removed");
      await loadWorkspaces(fallbackWorkspaceId);
    } catch (error) {
      setAppStatus(error.message);
    }
  }

  function openSettings() {
    setShowSettings(true);
    navigate("/app/settings");
  }

  function closeSettings(options = {}) {
    setShowSettings(false);
    if (options.redirectToLanding) {
      navigate("/");
      return;
    }
    navigate("/app");
  }

  async function handleFileUpload(file) {
    if (!file || !activeWorkspaceId) {
      return;
    }
    if (!activeConversationLocalId) {
      setComposerStatus("Create or choose a chat before uploading a document.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setComposerStatus("Uploading document...");
      const response = await uploadDocument(
        activeWorkspaceId,
        file,
        setUploadProgress,
        activeConversationLocalId,
        activeCollectionId
      );
      setComposerStatus(
        response.duplicate
          ? `${response.document_name} is already in this workspace.`
          : `${response.document_name} indexed successfully.`
      );
      setShowLibrary(true);
      await loadDocuments(activeWorkspaceId);
      await loadWorkspaceOverview(activeWorkspaceId);
    } catch (error) {
      setComposerStatus(error.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handlePreviewDocument(documentId) {
    try {
      const response = await fetchDocumentPreview(activeWorkspaceId, documentId);
      setPreview(response);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleDeleteDocument(documentId) {
    try {
      await deleteDocument(activeWorkspaceId, documentId);
      if (preview?.document_id === documentId) {
        setPreview(null);
      }
      setAppStatus("Document removed");
      await loadDocuments(activeWorkspaceId);
      await loadWorkspaceOverview(activeWorkspaceId);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleReindexDocument(documentId) {
    try {
      const response = await reindexDocument(activeWorkspaceId, documentId);
      setAppStatus(`Document reindexed (${response.chunks_stored} chunks)`);
      await loadDocuments(activeWorkspaceId);
      await loadWorkspaceOverview(activeWorkspaceId);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleMoveDocument(documentId, collectionId) {
    try {
      await moveDocumentToCollection(activeWorkspaceId, documentId, collectionId);
      await loadDocuments(activeWorkspaceId);
      setAppStatus("Document moved");
      await loadWorkspaceOverview(activeWorkspaceId);
    } catch (error) {
      setComposerStatus(error.message);
    }
  }

  async function handleSubmitQuestion(event) {
    event.preventDefault();
    if (!question.trim() || !activeWorkspaceId || isThinking) {
      return;
    }

    const content = question.trim();
    const localConversationId = activeConversation?.localId;
    if (!localConversationId) {
      setComposerStatus("Start a new chat in this workspace first");
      return;
    }
    const assistantMessageId = `assistant_${Date.now()}`;

    setQuestion("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "64px";
    }
    setComposerStatus("");
    setSelectedSource(null);

    updateConversation(localConversationId, (conversation) => ({
      ...conversation,
      title:
        conversation.messages.length === 0
          ? truncateLabel(content, 32)
          : conversation.title,
      updatedAt: new Date().toISOString(),
      messages: [
        ...conversation.messages,
        { id: `user_${Date.now()}`, role: "user", content },
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          sources: [],
          suggestions: [],
          confidence: null,
          rewrittenQuery: "",
          debug: null,
          isStreaming: true,
        },
      ],
    }));

    setIsThinking(true);
    setLoadingStage("Assistant is thinking...");
    if (stageTimerRef.current) {
      window.clearInterval(stageTimerRef.current);
    }
    stageTimerRef.current = window.setInterval(() => {
      setLoadingStage((current) =>
        current === "Assistant is thinking..."
          ? "Searching documents..."
          : "Assistant is thinking..."
      );
    }, 1100);

    try {
      await streamKnowledgeQuery(activeWorkspaceId, content, activeConversation.localId, {
        onMeta: (meta) => {
          if (meta.session_id) {
            window.sessionStorage.setItem(`session_id:${activeWorkspaceId}`, meta.session_id);
          }
          updateConversation(localConversationId, (conversation) => ({
            ...conversation,
            sessionId: meta.session_id || conversation.sessionId,
            updatedAt: new Date().toISOString(),
          }));
        },
        onChunk: ({ content: partial }) => {
          updateConversation(localConversationId, (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: partial,
                  }
                : message
            ),
          }));
        },
        onDone: (response) => {
          if (response.session_id) {
            window.sessionStorage.setItem(`session_id:${activeWorkspaceId}`, response.session_id);
          }
          updateConversation(localConversationId, (conversation) => ({
            ...conversation,
            sessionId: response.session_id,
            updatedAt: new Date().toISOString(),
            messages: conversation.messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    content: response.answer,
                    sources: (response.sources || []).map((source) => ({
                      ...source,
                      workspace_id: activeWorkspaceId,
                    })),
                    suggestions: response.suggestions || [],
                    confidence: response.confidence,
                    rewrittenQuery: response.rewritten_query,
                    debug: response.debug,
                    insights: response.insights || [],
                    themes: response.themes || [],
                    isStreaming: false,
                  }
                : message
            ),
          }));

          if (response.sources?.length) {
            setSelectedSource({
              ...response.sources[0],
              workspace_id: activeWorkspaceId,
            });
          }
        },
      });
    } catch (error) {
      updateConversation(localConversationId, (conversation) => ({
        ...conversation,
        messages: conversation.messages.filter((message) => message.id !== assistantMessageId),
      }));
      setComposerStatus(error.message);
    } finally {
      if (stageTimerRef.current) {
        window.clearInterval(stageTimerRef.current);
      }
      setIsThinking(false);
      setLoadingStage("Assistant is thinking...");
    }
  }

  function handleTextareaChange(event) {
    setQuestion(event.target.value);
    event.target.style.height = "0px";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 220)}px`;
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmitQuestion(event);
    }
  }

  function handleExamplePrompt(prompt) {
    setQuestion(prompt);
    if (textareaRef.current) {
      textareaRef.current.style.height = "0px";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 220)}px`;
      textareaRef.current.focus();
    }
  }

  return (
    <div className="refined-shell">
      <motion.aside
        className={`refined-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        animate={{ width: sidebarCollapsed ? 92 : 286 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
      >
        <div className="sidebar-header">
          <div>
            <h1>Knowledge Assistant</h1>
            {!sidebarCollapsed ? (
              <p className="subtle-copy">Ask questions about your documents</p>
            ) : null}
          </div>
          <button
            type="button"
            className="secondary-button icon-button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!sidebarCollapsed ? (
          <>
            <div className="sidebar-group" ref={workspaceMenuRef}>
              <p className="sidebar-group-title">Workspace</p>
              <button
                type="button"
                className="workspace-trigger"
                onClick={() => setShowWorkspaceMenu((current) => !current)}
              >
                <span>{activeWorkspace?.workspace_name || "Select workspace"}</span>
                <ChevronDown size={16} />
              </button>

              <AnimatePresence>
                {showWorkspaceMenu ? (
                  <motion.div
                    className="workspace-menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <div className="workspace-switch-list">
                      {workspaces.map((workspace) => (
                        <button
                          type="button"
                          key={workspace.workspace_id}
                          className={`workspace-option ${workspace.workspace_id === activeWorkspaceId ? "active" : ""}`}
                          onClick={() => {
                            setActiveWorkspaceId(workspace.workspace_id);
                            setShowWorkspaceMenu(false);
                          }}
                        >
                          {workspace.workspace_name}
                        </button>
                      ))}
                    </div>
                    <div className="workspace-menu-actions">
                      <button
                        type="button"
                        className="workspace-menu-action"
                        onClick={() => setShowWorkspaceCreate((current) => !current)}
                      >
                        Create workspace
                      </button>
                      <button
                        type="button"
                        className="workspace-menu-action"
                        onClick={handleDeleteWorkspace}
                        disabled={!activeWorkspaceId}
                      >
                        Delete workspace
                      </button>
                      <button type="button" className="workspace-menu-action" disabled>
                        Rename workspace
                      </button>
                    </div>

                    {showWorkspaceCreate ? (
                      <form onSubmit={handleCreateWorkspace} className="workspace-create-form">
                        <input
                          value={workspaceName}
                          onChange={(event) => setWorkspaceName(event.target.value)}
                          placeholder="Workspace name"
                        />
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={isCreatingWorkspace || !isBackendReachable}
                        >
                          {isCreatingWorkspace ? "Creating..." : "Create"}
                        </button>
                      </form>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <button
                type="button"
                className="primary-button new-chat-button"
                onClick={createNewChat}
                disabled={!activeWorkspaceId}
              >
                <Plus size={16} />
                <span>New Chat</span>
              </button>
            </div>

            <div className="sidebar-group">
              <p className="sidebar-group-title">Chats</p>
              <div className="sidebar-items">
                {activeWorkspaceId && conversations.length > 0 ? (
                  conversations.map((conversation) => (
                    <button
                      type="button"
                      key={conversation.localId}
                      className={`sidebar-item ${conversation.localId === activeConversationLocalId ? "active" : ""}`}
                      onClick={() => setActiveConversationLocalId(conversation.localId)}
                    >
                      <MessageSquare size={16} />
                      <span>{truncateLabel(conversation.title || "New chat", 28)}</span>
                    </button>
                  ))
                ) : (
                  <div className="sidebar-empty">Choose a workspace to start chatting.</div>
                )}
              </div>
            </div>

            <div className="sidebar-group">
              <p className="sidebar-group-title">Collections</p>
              <div className="sidebar-items">
                <button
                  type="button"
                  className={`sidebar-item ${activeCollectionId === "" ? "active" : ""}`}
                  onClick={() => {
                    setActiveCollectionId("");
                    setShowLibrary(true);
                  }}
                >
                  <span>All documents</span>
                </button>
                {collections.map((collection) => (
                  <button
                    type="button"
                    key={collection.collection_id}
                    className={`sidebar-item ${activeCollectionId === collection.collection_id ? "active" : ""}`}
                    onClick={() => {
                      setActiveCollectionId(collection.collection_id);
                      setShowLibrary(true);
                    }}
                  >
                    <span>{collection.collection_name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="sidebar-item"
                  onClick={() => setShowCollectionCreate((current) => !current)}
                >
                  <Plus size={16} />
                  <span>New collection</span>
                </button>
                {showCollectionCreate ? (
                  <form className="workspace-create-form" onSubmit={handleCreateCollection}>
                    <input
                      value={collectionName}
                      onChange={(event) => setCollectionName(event.target.value)}
                      placeholder="Collection name"
                    />
                    <button type="submit" className="primary-button">
                      Create
                    </button>
                  </form>
                ) : null}
                {activeCollectionId && activeCollection?.collection_name !== "General" ? (
                  <button
                    type="button"
                    className="secondary-button danger-button sidebar-inline-action"
                    onClick={handleDeleteCollection}
                  >
                    Delete collection
                  </button>
                ) : null}
              </div>
            </div>

            <div className="sidebar-group">
              <p className="sidebar-group-title">Knowledge</p>
              <div className="sidebar-items">
                <button
                  type="button"
                  className={`sidebar-item ${showOverview ? "active" : ""}`}
                  onClick={() => setShowOverview(true)}
                >
                  <span>Overview</span>
                </button>
                <button
                  type="button"
                  className={`sidebar-item ${showLibrary ? "active" : ""}`}
                  onClick={() => setShowLibrary(true)}
                >
                  <FileText size={16} />
                  <span>Documents</span>
                </button>
                <button
                  type="button"
                  className={`sidebar-item ${showKnowledgeMap ? "active" : ""}`}
                  onClick={() => setShowKnowledgeMap(true)}
                >
                  <Network size={16} />
                  <span>Knowledge Map</span>
                </button>
              </div>
            </div>

            <div className="sidebar-group">
              <p className="sidebar-group-title">System</p>
              <div className="sidebar-items">
                <button
                  type="button"
                  className={`sidebar-item ${showSettings ? "active" : ""}`}
                  onClick={openSettings}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="collapsed-sidebar-icons">
            <button type="button" className="sidebar-item collapsed" onClick={createNewChat}>
              <Plus size={16} />
            </button>
            <button type="button" className="sidebar-item collapsed" onClick={() => setShowOverview(true)}>
              <FileText size={16} />
            </button>
            <button type="button" className="sidebar-item collapsed" onClick={() => setShowLibrary(true)}>
              <FileText size={16} />
            </button>
            <button
              type="button"
              className="sidebar-item collapsed"
              onClick={() => setShowKnowledgeMap(true)}
            >
              <Network size={16} />
            </button>
            <button type="button" className="sidebar-item collapsed" onClick={openSettings}>
              <Settings size={16} />
            </button>
          </div>
        )}
      </motion.aside>

      <main className="refined-main">
        <header className="main-header">
          <div>
            <p className="assistant-eyebrow">Knowledge Assistant</p>
            <h2>Workspace: {activeWorkspace?.workspace_name || "None selected"}</h2>
          </div>
        </header>

        {!isBackendReachable ? (
          <section className="empty-state">
            <h3>Backend unavailable</h3>
            <p>
              The frontend could not reach <code>{API_BASE_URL}</code>. Start FastAPI and retry.
            </p>
            <button type="button" onClick={() => loadWorkspaces()}>
              Retry connection
            </button>
          </section>
        ) : !activeWorkspaceId ? (
          <section className="empty-state">
            <h3>Create a workspace</h3>
            <p>Upload documents, ask questions, and see answers with sources.</p>
          </section>
        ) : (
          <>
            <div className="chat-column">
              <ChatWindow
                messages={messages}
                isThinking={isThinking}
                loadingStage={loadingStage}
                onSelectSource={setSelectedSource}
                examplePrompts={EXAMPLE_PROMPTS}
                onPickExample={handleExamplePrompt}
              />
            </div>

            <form
              className={`composer ${isUploading ? "uploading" : ""}`}
              onSubmit={handleSubmitQuestion}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleFileUpload(event.dataTransfer.files?.[0]);
              }}
            >
              <div className="composer-inline">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!activeConversationLocalId}
                >
                  Upload
                </button>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={handleTextareaChange}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  placeholder={
                    activeConversationLocalId
                      ? "Ask your documents anything..."
                      : "Select a workspace, start a chat, then upload documents here"
                  }
                  disabled={!activeConversationLocalId}
                />
                <button
                  type="submit"
                  disabled={isThinking || !question.trim() || !activeConversationLocalId}
                >
                  Send
                </button>
              </div>
              <p className="composer-meta-row">Enter to send. Shift+Enter for newline.</p>
              {isUploading ? (
                <div className="progress-row">
                  <span>Uploading document...</span>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              ) : null}
              {composerStatus ? <p className="composer-status">{composerStatus}</p> : null}
            </form>

            {developerMode ? <DebugPanel debug={latestAssistantMessage?.debug} /> : null}
          </>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden-file-input"
        accept=".pdf,.txt,.md,.markdown"
        onChange={(event) => {
          handleFileUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <AnimatePresence>
        {showOverview ? (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="overlay-panel settings-panel"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <div className="drawer-header">
                <div>
                  <p className="sidebar-group-title">Workspace</p>
                  <h3>Overview</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setShowOverview(false)}>
                  Close
                </button>
              </div>

              <div className="graph-document-pills">
                <div className="metric-card"><span>Collections</span><strong>{workspaceOverview?.collection_count || 0}</strong></div>
                <div className="metric-card"><span>Documents</span><strong>{workspaceOverview?.document_count || 0}</strong></div>
                <div className="metric-card"><span>Topics</span><strong>{workspaceOverview?.topic_count || 0}</strong></div>
                <div className="metric-card"><span>Entities</span><strong>{workspaceOverview?.entity_count || 0}</strong></div>
              </div>

              <div className="detail-group">
                <strong>Top Topics</strong>
                <div className="document-tags">
                  {(workspaceOverview?.top_topics || []).map((topic) => (
                    <span key={topic} className="document-tag">{topic}</span>
                  ))}
                </div>
              </div>

              <div className="detail-group">
                <strong>Recent Documents</strong>
                <div className="table-shell">
                  {(workspaceOverview?.recent_documents || []).map((document) => (
                    <div key={document.document_id} className="table-row">
                      <div className="document-cell">
                        <strong>{document.file_name}</strong>
                        <p className="subtle-copy">{document.collection_name || "Unassigned"}</p>
                      </div>
                      <span>{new Date(document.upload_timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {!(workspaceOverview?.recent_documents || []).length ? (
                    <div className="table-empty">No documents yet.</div>
                  ) : null}
                </div>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSource ? (
          <motion.aside
            className="context-drawer"
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="drawer-header">
              <div>
                <p className="sidebar-group-title">Source</p>
                <h3>{selectedSource.document}</h3>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedSource(null)}
              >
                Close
              </button>
            </div>
            <SourceViewer
              source={selectedSource}
              onOpenDocument={(documentId) => {
                setShowLibrary(true);
                setSelectedSource(null);
                handlePreviewDocument(documentId);
              }}
            />
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showLibrary ? (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="overlay-panel library-panel"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <div className="drawer-header">
                <div>
                  <p className="sidebar-group-title">Knowledge</p>
                  <h3>{activeCollection ? `${activeCollection.collection_name} Documents` : "Documents"}</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setShowLibrary(false)}>
                  Close
                </button>
              </div>

              <div className="table-shell">
                <div className="table-header">
                  <span>Name</span>
                  <span>Chunks</span>
                  <span>Uploaded</span>
                  <span>Size</span>
                  <span>Actions</span>
                </div>
                {filteredDocuments.map((document) => (
                  <div key={document.document_id} className="table-row">
                    <div className="document-cell">
                      <strong>{document.file_name}</strong>
                      {document.collection_name ? (
                        <p className="subtle-copy">Collection: {document.collection_name}</p>
                      ) : null}
                      {document.summary ? <p className="document-summary">{document.summary}</p> : null}
                      {document.topics?.length ? (
                        <div className="document-tags">
                          {document.topics.slice(0, 3).map((topic) => (
                            <span key={topic} className="document-tag">
                              {topic}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <span>{document.chunk_count}</span>
                    <span>{new Date(document.upload_timestamp).toLocaleDateString()}</span>
                    <span>{formatFileSize(document.file_size)}</span>
                    <span className="table-actions">
                      <select
                        value={document.collection_id || ""}
                        onChange={(event) => handleMoveDocument(document.document_id, event.target.value)}
                      >
                        {collections.map((collection) => (
                          <option key={collection.collection_id} value={collection.collection_id}>
                            {collection.collection_name}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="secondary-button" onClick={() => handlePreviewDocument(document.document_id)}>
                        Preview
                      </button>
                      <button type="button" className="secondary-button" onClick={() => handleReindexDocument(document.document_id)}>
                        Reindex
                      </button>
                      <button type="button" className="secondary-button danger-button" onClick={() => handleDeleteDocument(document.document_id)}>
                        Delete
                      </button>
                    </span>
                  </div>
                ))}
                {filteredDocuments.length === 0 ? <div className="table-empty">No documents in this collection yet.</div> : null}
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showKnowledgeMap ? (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="overlay-panel graph-panel"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <div className="drawer-header">
                <div>
                  <p className="sidebar-group-title">Knowledge</p>
                  <h3>Knowledge Map</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setShowKnowledgeMap(false)}>
                  Close
                </button>
              </div>

              <div className="graph-layout">
                <KnowledgeGraphPage
                  workspaceId={activeWorkspaceId}
                  documents={filteredDocuments}
                  onSelectNode={setSelectedGraphNode}
                />

                <aside className="graph-detail">
                  {selectedGraphNode ? (
                    <>
                      <p className="sidebar-group-title">{selectedGraphNode.type}</p>
                      <h4>{selectedGraphNode.label}</h4>
                      {selectedGraphNode.summary ? (
                        <p className="document-summary">{selectedGraphNode.summary}</p>
                      ) : null}
                      {selectedGraphNode.upload_timestamp ? (
                        <div className="detail-group">
                          <strong>Upload date</strong>
                          <p className="subtle-copy">
                            {new Date(selectedGraphNode.upload_timestamp).toLocaleString()}
                          </p>
                        </div>
                      ) : null}
                      {selectedGraphNode.topics?.length ? (
                        <div className="detail-group">
                          <strong>Topics</strong>
                          <div className="document-tags">
                            {selectedGraphNode.topics.map((topic) => (
                              <span key={topic} className="document-tag">
                                {topic}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectedGraphNode.entities?.length ? (
                        <div className="detail-group">
                          <strong>Entities</strong>
                          <div className="document-tags">
                            {selectedGraphNode.entities.map((entity) => (
                              <span key={entity} className="document-tag">
                                {entity}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {selectedGraphNode.documents?.length ? (
                        <div className="detail-group">
                          <strong>Related documents</strong>
                          <ul className="detail-list">
                            {selectedGraphNode.documents.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {selectedGraphNode.related_topics?.length ? (
                        <div className="detail-group">
                          <strong>Related topics</strong>
                          <ul className="detail-list">
                            {selectedGraphNode.related_topics.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {selectedGraphNode.related_entities?.length ? (
                        <div className="detail-group">
                          <strong>Related entities</strong>
                          <ul className="detail-list">
                            {selectedGraphNode.related_entities.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="graph-empty">
                      Select documents, then click a document, topic, or entity to inspect its relationships.
                    </div>
                  )}
                </aside>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings ? (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="overlay-panel settings-panel"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
            >
              <SettingsPage
                developerMode={developerMode}
                onDeveloperModeChange={setDeveloperMode}
                onClose={closeSettings}
              />
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {preview ? (
          <motion.div className="overlay-shell preview-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section
              className="overlay-panel preview-panel"
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 80, opacity: 0 }}
            >
              <div className="drawer-header">
                <div>
                  <p className="sidebar-group-title">Preview</p>
                  <h3>{preview.file_name}</h3>
                </div>
                <button type="button" className="secondary-button" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
              <pre className="document-preview">{preview.content || "Preview unavailable."}</pre>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {appStatus ? <div className="toast">{appStatus}</div> : null}
    </div>
  );
}

export default AppDashboard;
