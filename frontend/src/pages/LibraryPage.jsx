import { useEffect, useState } from "react";
import { deleteDocument, fetchDocumentPreview, fetchDocuments, reindexDocument } from "../services/api";

function LibraryPage({ workspaceId }) {
  const [documents, setDocuments] = useState([]);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");

  async function loadDocuments() {
    if (!workspaceId) {
      setDocuments([]);
      return;
    }
    try {
      const data = await fetchDocuments(workspaceId);
      setDocuments(data.documents || []);
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    setPreview(null);
    loadDocuments();
    const query = new URLSearchParams(window.location.search);
    const documentId = query.get("doc");
    const workspaceParam = query.get("workspace");
    if (documentId && (!workspaceParam || workspaceParam === workspaceId)) {
      handlePreview(documentId);
    }
  }, [workspaceId]);

  async function handlePreview(documentId) {
    try {
      const data = await fetchDocumentPreview(workspaceId, documentId);
      setPreview(data);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleDelete(documentId) {
    try {
      const response = await deleteDocument(workspaceId, documentId);
      setStatus(response.message);
      if (preview?.document_id === documentId) {
        setPreview(null);
      }
      await loadDocuments();
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function handleReindex(documentId) {
    try {
      const response = await reindexDocument(workspaceId, documentId);
      setStatus(`${response.message} (${response.chunks_stored} chunks)`);
      await loadDocuments();
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <section className="grid">
      <div className="card">
        <h2>Document library</h2>
        {status ? <p className="status">{status}</p> : null}
        <ul className="document-list">
          {documents.map((document) => (
            <li key={document.document_id} className="document-row">
              <div>
                <strong>{document.file_name}</strong>
                <p className="muted small">
                  {(document.file_size / 1024).toFixed(1)} KB | {document.chunk_count} chunks |{" "}
                  {new Date(document.upload_timestamp).toLocaleString()}
                </p>
              </div>
              <div className="document-actions">
                <button type="button" onClick={() => handlePreview(document.document_id)}>
                  Preview
                </button>
                <button type="button" onClick={() => handleReindex(document.document_id)}>
                  Reindex
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => handleDelete(document.document_id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Preview</h2>
        {preview ? (
          <>
            <p className="muted small">{preview.file_name}</p>
            <pre className="document-preview">{preview.content || "Preview unavailable."}</pre>
          </>
        ) : (
          <p className="muted">Select a document to preview it.</p>
        )}
      </div>
    </section>
  );
}

export default LibraryPage;
