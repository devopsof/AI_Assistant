import { useState } from "react";
import { searchDocuments } from "../services/api";
import SourceViewer from "./SourceViewer";

function SearchPanel({ workspaceId }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function handleSearch(event) {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }

    try {
      setIsSearching(true);
      setStatus("");
      const response = await searchDocuments(workspaceId, query.trim());
      setResults(response.results || []);
      if (!response.results?.length) {
        setStatus("No matching chunks found.");
      }
    } catch (error) {
      setStatus(error.message);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section className="card stack">
      <div>
        <h2>Search documents</h2>
        <p className="muted">Run hybrid search without generating an AI answer.</p>
      </div>

      <form onSubmit={handleSearch} className="chat-form">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search for Kubernetes, CI/CD, architecture..."
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? "Searching..." : "Search"}
        </button>
      </form>

      {status ? <p className="status">{status}</p> : null}

      <div className="source-stack">
        {results.map((result) => (
          <SourceViewer
            key={`${result.document_id}-${result.chunk_id}`}
            source={{
              document_id: result.document_id,
              document: result.document,
              chunk: result.chunk_id,
              chunk_index: result.chunk_index,
              similarity_score: result.combined_score,
              chunk_text: result.text,
              previous_chunk_text: result.previous_chunk_text,
              next_chunk_text: result.next_chunk_text,
              workspace_id: workspaceId,
            }}
          />
        ))}
      </div>
    </section>
  );
}

export default SearchPanel;
