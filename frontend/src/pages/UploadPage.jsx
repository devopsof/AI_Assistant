import { useEffect, useState } from "react";
import UploadPanel from "../components/UploadPanel";
import { deleteDocument, fetchDocuments, uploadDocument } from "../services/api";

function UploadPage({ workspaceId }) {
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busyDocumentId, setBusyDocumentId] = useState("");

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
    loadDocuments();
  }, [workspaceId]);

  async function handleUpload(file) {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      setStatus("Uploading and indexing document...");
      const response = await uploadDocument(workspaceId, file, setUploadProgress);
      setStatus(
        response.duplicate
          ? `${response.document_name} is already in the library.`
          : `${response.document_name} indexed successfully.`
      );
      await loadDocuments();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(documentId) {
    try {
      setBusyDocumentId(documentId);
      const response = await deleteDocument(workspaceId, documentId);
      setStatus(response.message);
      await loadDocuments();
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusyDocumentId("");
    }
  }

  return (
    <section className="grid">
      <div className="card stack">
        <div>
          <h2>Upload knowledge</h2>
          <p className="muted">
            Upload files into the active workspace and keep each knowledge base isolated.
          </p>
        </div>
        <UploadPanel
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
        />
        {status ? <p className="status">{status}</p> : null}
      </div>

      <div className="card">
        <h2>Uploaded documents</h2>
        {documents.length === 0 ? (
          <p className="muted">No documents uploaded yet.</p>
        ) : (
          <ul className="document-list">
            {documents.map((document) => (
              <li key={document.document_id} className="document-row">
                <div>
                  <strong>{document.file_name}</strong>
                  <p className="muted small">
                    {document.chunk_count} chunks |{" "}
                    {new Date(document.upload_timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busyDocumentId === document.document_id}
                  onClick={() => handleDelete(document.document_id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default UploadPage;
