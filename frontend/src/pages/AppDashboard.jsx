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
import KnowledgeGraphPage from "./KnowledgeGraphPage";
import SettingsPage from "./SettingsPage";

import { useWorkspace } from "../hooks/useWorkspace";
import { useDocuments } from "../hooks/useDocuments";
import { useConversations } from "../hooks/useConversations";
import { API_BASE_URL } from "../services/api";

const EXAMPLE_PROMPTS = [
  "What is Kubernetes?",
  "Summarize my DevOps notes",
  "Explain Docker architecture",
];

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateLabel(value, length = 34) {
  if (!value) return "";
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function AppDashboard({ initialPanel = "chat" }) {
  const navigate = useNavigate();

  // ── UI state ──────────────────────────────────────────────────────────────
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
  const [developerMode, setDeveloperMode] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [collectionName, setCollectionName] = useState("");
  const [question, setQuestion] = useState("");
  const [composerStatus, setComposerStatus] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [appStatus, setAppStatus] = useState("");

  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const workspaceMenuRef = useRef(null);

  // ── Hooks ──────────────────────────────────────────────────────────────────
  const workspace = useWorkspace();
  const conversations = useConversations(
    workspace.activeWorkspaceId,
    setComposerStatus
  );
  const docs = useDocuments(
    workspace.activeWorkspaceId,
    workspace.activeCollectionId,
    conversations.activeConversation?.localId,
    setComposerStatus
  );

  const messages = conversations.activeConversation?.messages || [];
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    workspace.loadWorkspaces();
  }, []);

  useEffect(() => {
    setShowSettings(initialPanel === "settings");
  }, [initialPanel]);

  useEffect(() => {
    if (!workspace.activeWorkspaceId) return;
    docs.loadDocuments(workspace.activeWorkspaceId);
    workspace.loadOverview(workspace.activeWorkspaceId);
    setSelectedSource(null);
    setSelectedGraphNode(null);
    docs.setPreview(null);
  }, [workspace.activeWorkspaceId]);

  useEffect(() => {
    if (!conversations.activeConversationLocalId) return;
    conversations.hydrateConversation(conversations.activeConversationLocalId);
  }, [conversations.activeConversationLocalId, conversations.hydrateConversation]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target)) {
        setShowWorkspaceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  async function handleCreateWorkspace(event) {
    event.preventDefault();
    if (!workspaceName.trim()) return;
    try {
      setIsCreatingWorkspace(true);
      await workspace.handleCreateWorkspace(workspaceName);
      setWorkspaceName("");
      setShowWorkspaceCreate(false);
      setShowWorkspaceMenu(false);
    } catch (err) {
      setAppStatus(err.message);
    } finally {
      setIsCreatingWorkspace(false);
    }
  }

  async function handleDeleteWorkspace() {
    if (!workspace.activeWorkspace) return;
    if (!window.confirm(`Delete workspace "${workspace.activeWorkspace.workspace_name}" and all its documents?`)) return;
    try {
      const fallbackId = await workspace.handleDeleteWorkspace();
      conversations.clearWorkspaceConversations(workspace.activeWorkspaceId);
      setSelectedSource(null);
      setShowLibrary(false);
      setShowKnowledgeMap(false);
      setShowSettings(false);
      navigate("/app");
      setShowWorkspaceMenu(false);
      if (!fallbackId) {
        docs.loadDocuments("");
      }
    } catch (err) {
      setAppStatus(err.message);
    }
  }

  async function handleCreateCollection(event) {
    event.preventDefault();
    if (!collectionName.trim() || !workspace.activeWorkspaceId) return;
    try {
      await workspace.handleCreateCollection(collectionName);
      setCollectionName("");
      setShowCollectionCreate(false);
      setShowLibrary(true);
      await docs.loadDocuments(workspace.activeWorkspaceId);
    } catch (err) {
      setComposerStatus(err.message);
    }
  }

  async function handleDeleteCollection() {
    if (!workspace.activeCollection || workspace.activeCollection.collection_name === "General") return;
    if (!window.confirm(`Delete collection "${workspace.activeCollection.collection_name}"? Documents inside it will move to General.`)) return;
    try {
      await workspace.handleDeleteCollection();
      await docs.loadDocuments(workspace.activeWorkspaceId);
      setShowLibrary(true);
    } catch (err) {
      setComposerStatus(err.message);
    }
  }

  async function handleFileUpload(file) {
    const response = await docs.handleUpload(file);
    if (response) {
      setShowLibrary(true);
      await workspace.loadOverview(workspace.activeWorkspaceId);
    }
  }

  async function handleDeleteDocument(documentId) {
    await docs.handleDelete(documentId);
    await workspace.loadOverview(workspace.activeWorkspaceId);
  }

  async function handleReindexDocument(documentId) {
    await docs.handleReindex(documentId);
    await workspace.loadOverview(workspace.activeWorkspaceId);
  }

  async function handleMoveDocument(documentId, collectionId) {
    await docs.handleMove(documentId, collectionId);
    await workspace.loadOverview(workspace.activeWorkspaceId);
  }

  async function handleSubmitQuestion(event) {
    event.preventDefault();
    if (!question.trim() || !workspace.activeWorkspaceId || conversations.isThinking) return;
    if (!conversations.activeConversation) {
      setComposerStatus("Start a new chat in this workspace first");
      return;
    }
    const content = question.trim();
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "64px";
    await conversations.submitQuestion(content, workspace.activeWorkspaceId, setSelectedSource);
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

  function openSettings() {
    setShowSettings(true);
    navigate("/app/settings");
  }

  function closeSettings(options = {}) {
    setShowSettings(false);
    if (options.redirectToLanding) { navigate("/"); return; }
    navigate("/app");
  }

  const canChat = Boolean(workspace.activeWorkspaceId && conversations.activeConversation?.localId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="refined-shell">
      {/* ── Sidebar ── */}
      <motion.aside
        className={`refined-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        animate={{ width: sidebarCollapsed ? 92 : 286 }}
        transition={{ type: "spring", stiffness: 220, damping: 24 }}
      >
        <div className="sidebar-header">
          <div>
            <h1>Knowledge Assistant</h1>
            {!sidebarCollapsed && <p className="subtle-copy">Ask questions about your documents</p>}
          </div>
          <button
            type="button"
            className="secondary-button icon-button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            {/* Workspace selector */}
            <div className="sidebar-group" ref={workspaceMenuRef}>
              <p className="sidebar-group-title">Workspace</p>
              <button type="button" className="workspace-trigger" onClick={() => setShowWorkspaceMenu((v) => !v)}>
                <span>{workspace.activeWorkspace?.workspace_name || "Select workspace"}</span>
                <ChevronDown size={16} />
              </button>

              <AnimatePresence>
                {showWorkspaceMenu && (
                  <motion.div className="workspace-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <div className="workspace-switch-list">
                      {workspace.workspaces.map((w) => (
                        <button
                          type="button"
                          key={w.workspace_id}
                          className={`workspace-option ${w.workspace_id === workspace.activeWorkspaceId ? "active" : ""}`}
                          onClick={() => { workspace.setActiveWorkspaceId(w.workspace_id); setShowWorkspaceMenu(false); }}
                        >
                          {w.workspace_name}
                        </button>
                      ))}
                    </div>
                    <div className="workspace-menu-actions">
                      <button type="button" className="workspace-menu-action" onClick={() => setShowWorkspaceCreate((v) => !v)}>Create workspace</button>
                      <button type="button" className="workspace-menu-action" onClick={handleDeleteWorkspace} disabled={!workspace.activeWorkspaceId}>Delete workspace</button>
                    </div>
                    {showWorkspaceCreate && (
                      <form onSubmit={handleCreateWorkspace} className="workspace-create-form">
                        <input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="Workspace name" />
                        <button type="submit" className="primary-button" disabled={isCreatingWorkspace || !workspace.isBackendReachable}>
                          {isCreatingWorkspace ? "Creating..." : "Create"}
                        </button>
                      </form>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <button type="button" className="primary-button new-chat-button" onClick={() => conversations.createNewChat()} disabled={!workspace.activeWorkspaceId}>
                <Plus size={16} /><span>New Chat</span>
              </button>
            </div>

            {/* Chats */}
            <div className="sidebar-group">
              <p className="sidebar-group-title">Chats</p>
              <div className="sidebar-items">
                {conversations.conversations.length > 0
                  ? conversations.conversations.map((conv) => (
                      <button
                        type="button"
                        key={conv.localId}
                        className={`sidebar-item ${conv.localId === conversations.activeConversationLocalId ? "active" : ""}`}
                        onClick={() => conversations.setActiveConversationLocalId(conv.localId)}
                      >
                        <MessageSquare size={16} />
                        <span>{truncateLabel(conv.title || "New chat", 28)}</span>
                      </button>
                    ))
                  : <div className="sidebar-empty">Choose a workspace to start chatting.</div>
                }
              </div>
            </div>

            {/* Collections */}
            <div className="sidebar-group">
              <p className="sidebar-group-title">Collections</p>
              <div className="sidebar-items">
                <button type="button" className={`sidebar-item ${workspace.activeCollectionId === "" ? "active" : ""}`} onClick={() => { workspace.setActiveCollectionId(""); setShowLibrary(true); }}>
                  <span>All documents</span>
                </button>
                {workspace.collections.map((col) => (
                  <button
                    type="button"
                    key={col.collection_id}
                    className={`sidebar-item ${workspace.activeCollectionId === col.collection_id ? "active" : ""}`}
                    onClick={() => { workspace.setActiveCollectionId(col.collection_id); setShowLibrary(true); }}
                  >
                    <span>{col.collection_name}</span>
                  </button>
                ))}
                <button type="button" className="sidebar-item" onClick={() => setShowCollectionCreate((v) => !v)}>
                  <Plus size={16} /><span>New collection</span>
                </button>
                {showCollectionCreate && (
                  <form className="workspace-create-form" onSubmit={handleCreateCollection}>
                    <input value={collectionName} onChange={(e) => setCollectionName(e.target.value)} placeholder="Collection name" />
                    <button type="submit" className="primary-button">Create</button>
                  </form>
                )}
                {workspace.activeCollectionId && workspace.activeCollection?.collection_name !== "General" && (
                  <button type="button" className="secondary-button danger-button sidebar-inline-action" onClick={handleDeleteCollection}>
                    Delete collection
                  </button>
                )}
              </div>
            </div>

            {/* Knowledge */}
            <div className="sidebar-group">
              <p className="sidebar-group-title">Knowledge</p>
              <div className="sidebar-items">
                <button type="button" className={`sidebar-item ${showOverview ? "active" : ""}`} onClick={() => setShowOverview(true)}><span>Overview</span></button>
                <button type="button" className={`sidebar-item ${showLibrary ? "active" : ""}`} onClick={() => setShowLibrary(true)}><FileText size={16} /><span>Documents</span></button>
                <button type="button" className={`sidebar-item ${showKnowledgeMap ? "active" : ""}`} onClick={() => setShowKnowledgeMap(true)}><Network size={16} /><span>Knowledge Map</span></button>
              </div>
            </div>

            {/* System */}
            <div className="sidebar-group">
              <p className="sidebar-group-title">System</p>
              <div className="sidebar-items">
                <button type="button" className={`sidebar-item ${showSettings ? "active" : ""}`} onClick={openSettings}><Settings size={16} /><span>Settings</span></button>
              </div>
            </div>
          </>
        )}

        {sidebarCollapsed && (
          <div className="collapsed-sidebar-icons">
            <button type="button" className="sidebar-item collapsed" onClick={() => conversations.createNewChat()}><Plus size={16} /></button>
            <button type="button" className="sidebar-item collapsed" onClick={() => setShowOverview(true)}><FileText size={16} /></button>
            <button type="button" className="sidebar-item collapsed" onClick={() => setShowLibrary(true)}><FileText size={16} /></button>
            <button type="button" className="sidebar-item collapsed" onClick={() => setShowKnowledgeMap(true)}><Network size={16} /></button>
            <button type="button" className="sidebar-item collapsed" onClick={openSettings}><Settings size={16} /></button>
          </div>
        )}
      </motion.aside>

      {/* ── Main ── */}
      <main className="refined-main">
        <header className="main-header">
          <div>
            <p className="assistant-eyebrow">Knowledge Assistant</p>
            <h2>Workspace: {workspace.activeWorkspace?.workspace_name || "None selected"}</h2>
          </div>
        </header>

        {!workspace.isBackendReachable ? (
          <section className="empty-state">
            <h3>Backend unavailable</h3>
            <p>The frontend could not reach <code>{API_BASE_URL}</code>. Start FastAPI and retry.</p>
            <button type="button" onClick={() => workspace.loadWorkspaces()}>Retry connection</button>
          </section>
        ) : !workspace.activeWorkspaceId ? (
          <section className="empty-state">
            <h3>Create a workspace</h3>
            <p>Upload documents, ask questions, and see answers with sources.</p>
          </section>
        ) : (
          <>
            <div className="chat-column">
              <ChatWindow
                messages={messages}
                isThinking={conversations.isThinking}
                loadingStage={conversations.loadingStage}
                onSelectSource={setSelectedSource}
                examplePrompts={EXAMPLE_PROMPTS}
                onPickExample={handleExamplePrompt}
              />
            </div>

            <form
              className={`composer ${docs.isUploading ? "uploading" : ""}`}
              onSubmit={handleSubmitQuestion}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files?.[0]); }}
            >
              <div className="composer-inline">
                <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()} disabled={!canChat}>Upload</button>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={handleTextareaChange}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  placeholder={canChat ? "Ask your documents anything..." : "Select a workspace, start a chat, then upload documents here"}
                  disabled={!canChat}
                />
                <button type="submit" disabled={conversations.isThinking || !question.trim() || !canChat}>Send</button>
              </div>
              <p className="composer-meta-row">Enter to send. Shift+Enter for newline.</p>
              {docs.isUploading && (
                <div className="progress-row">
                  <span>Uploading document...</span>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${docs.uploadProgress}%` }} />
                  </div>
                </div>
              )}
              {composerStatus && <p className="composer-status">{composerStatus}</p>}
            </form>

            {developerMode && <DebugPanel debug={latestAssistantMessage?.debug} />}
          </>
        )}
      </main>

      {/* ── Hidden file input ── */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden-file-input"
        accept=".pdf,.txt,.md,.markdown"
        onChange={(e) => { handleFileUpload(e.target.files?.[0]); e.target.value = ""; }}
      />

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showOverview && (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="overlay-panel settings-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <div className="drawer-header">
                <div><p className="sidebar-group-title">Workspace</p><h3>Overview</h3></div>
                <button type="button" className="secondary-button" onClick={() => setShowOverview(false)}>Close</button>
              </div>
              <div className="graph-document-pills">
                <div className="metric-card"><span>Collections</span><strong>{workspace.workspaceOverview?.collection_count || 0}</strong></div>
                <div className="metric-card"><span>Documents</span><strong>{workspace.workspaceOverview?.document_count || 0}</strong></div>
                <div className="metric-card"><span>Topics</span><strong>{workspace.workspaceOverview?.topic_count || 0}</strong></div>
                <div className="metric-card"><span>Entities</span><strong>{workspace.workspaceOverview?.entity_count || 0}</strong></div>
              </div>
              <div className="detail-group">
                <strong>Top Topics</strong>
                <div className="document-tags">
                  {(workspace.workspaceOverview?.top_topics || []).map((t) => <span key={t} className="document-tag">{t}</span>)}
                </div>
              </div>
              <div className="detail-group">
                <strong>Recent Documents</strong>
                <div className="table-shell">
                  {(workspace.workspaceOverview?.recent_documents || []).map((doc) => (
                    <div key={doc.document_id} className="table-row">
                      <div className="document-cell"><strong>{doc.file_name}</strong><p className="subtle-copy">{doc.collection_name || "Unassigned"}</p></div>
                      <span>{new Date(doc.upload_timestamp).toLocaleDateString()}</span>
                    </div>
                  ))}
                  {!(workspace.workspaceOverview?.recent_documents || []).length && <div className="table-empty">No documents yet.</div>}
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedSource && (
          <motion.aside className="context-drawer" initial={{ x: 320, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 320, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="drawer-header">
              <div><p className="sidebar-group-title">Source</p><h3>{selectedSource.document}</h3></div>
              <button type="button" className="secondary-button" onClick={() => setSelectedSource(null)}>Close</button>
            </div>
            <SourceViewer
              source={selectedSource}
              onOpenDocument={(documentId) => { setShowLibrary(true); setSelectedSource(null); docs.handlePreview(documentId); }}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLibrary && (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="overlay-panel library-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <div className="drawer-header">
                <div><p className="sidebar-group-title">Knowledge</p><h3>{workspace.activeCollection ? `${workspace.activeCollection.collection_name} Documents` : "Documents"}</h3></div>
                <button type="button" className="secondary-button" onClick={() => setShowLibrary(false)}>Close</button>
              </div>
              <div className="table-shell">
                <div className="table-header"><span>Name</span><span>Chunks</span><span>Uploaded</span><span>Size</span><span>Actions</span></div>
                {docs.filteredDocuments.map((doc) => (
                  <div key={doc.document_id} className="table-row">
                    <div className="document-cell">
                      <strong>{doc.file_name}</strong>
                      {doc.collection_name && <p className="subtle-copy">Collection: {doc.collection_name}</p>}
                      {doc.summary && <p className="document-summary">{doc.summary}</p>}
                      {doc.topics?.length > 0 && (
                        <div className="document-tags">
                          {doc.topics.slice(0, 3).map((t) => <span key={t} className="document-tag">{t}</span>)}
                        </div>
                      )}
                    </div>
                    <span>{doc.chunk_count}</span>
                    <span>{new Date(doc.upload_timestamp).toLocaleDateString()}</span>
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span className="table-actions">
                      <select value={doc.collection_id || ""} onChange={(e) => handleMoveDocument(doc.document_id, e.target.value)}>
                        {workspace.collections.map((col) => <option key={col.collection_id} value={col.collection_id}>{col.collection_name}</option>)}
                      </select>
                      <button type="button" className="secondary-button" onClick={() => docs.handlePreview(doc.document_id)}>Preview</button>
                      <button type="button" className="secondary-button" onClick={() => handleReindexDocument(doc.document_id)}>Reindex</button>
                      <button type="button" className="secondary-button danger-button" onClick={() => handleDeleteDocument(doc.document_id)}>Delete</button>
                    </span>
                  </div>
                ))}
                {docs.filteredDocuments.length === 0 && <div className="table-empty">No documents in this collection yet.</div>}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showKnowledgeMap && (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="overlay-panel graph-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <div className="drawer-header">
                <div><p className="sidebar-group-title">Knowledge</p><h3>Knowledge Map</h3></div>
                <button type="button" className="secondary-button" onClick={() => setShowKnowledgeMap(false)}>Close</button>
              </div>
              <div className="graph-layout">
                <KnowledgeGraphPage workspaceId={workspace.activeWorkspaceId} documents={docs.filteredDocuments} onSelectNode={setSelectedGraphNode} />
                <aside className="graph-detail">
                  {selectedGraphNode ? (
                    <>
                      <p className="sidebar-group-title">{selectedGraphNode.type}</p>
                      <h4>{selectedGraphNode.label}</h4>
                      {selectedGraphNode.summary && <p className="document-summary">{selectedGraphNode.summary}</p>}
                      {selectedGraphNode.topics?.length > 0 && <div className="detail-group"><strong>Topics</strong><div className="document-tags">{selectedGraphNode.topics.map((t) => <span key={t} className="document-tag">{t}</span>)}</div></div>}
                      {selectedGraphNode.entities?.length > 0 && <div className="detail-group"><strong>Entities</strong><div className="document-tags">{selectedGraphNode.entities.map((e) => <span key={e} className="document-tag">{e}</span>)}</div></div>}
                      {selectedGraphNode.documents?.length > 0 && <div className="detail-group"><strong>Related documents</strong><ul className="detail-list">{selectedGraphNode.documents.map((d) => <li key={d}>{d}</li>)}</ul></div>}
                    </>
                  ) : (
                    <div className="graph-empty">Select documents, then click a node to inspect its relationships.</div>
                  )}
                </aside>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <motion.div className="overlay-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="overlay-panel settings-panel" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
              <SettingsPage developerMode={developerMode} onDeveloperModeChange={setDeveloperMode} onClose={closeSettings} />
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {docs.preview && (
          <motion.div className="overlay-shell preview-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.section className="overlay-panel preview-panel" initial={{ x: 80, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 80, opacity: 0 }}>
              <div className="drawer-header">
                <div><p className="sidebar-group-title">Preview</p><h3>{docs.preview.file_name}</h3></div>
                <button type="button" className="secondary-button" onClick={() => docs.setPreview(null)}>Close</button>
              </div>
              <pre className="document-preview">{docs.preview.content || "Preview unavailable."}</pre>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>

      {appStatus && <div className="toast">{appStatus}</div>}
    </div>
  );
}

export default AppDashboard;
