import { useState } from "react";

function UploadPanel({ onUpload, isUploading, uploadProgress }) {
  const [selectedFile, setSelectedFile] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedFile) {
      return;
    }
    await onUpload(selectedFile);
    setSelectedFile(null);
    event.target.reset();
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack">
      <div
        className="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.txt,.md,.markdown"
          onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
        />
        <p>{selectedFile ? selectedFile.name : "Drop a file here or browse"}</p>
      </div>
      <button type="submit" disabled={isUploading || !selectedFile}>
        {isUploading ? "Uploading..." : "Upload document"}
      </button>
      {isUploading ? (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
        </div>
      ) : null}
    </form>
  );
}

export default UploadPanel;
