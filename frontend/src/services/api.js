export const API_BASE_URL =
    process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:9000";

function networkErrorMessage() {
    return `Cannot reach the backend at ${API_BASE_URL}. Start the FastAPI server and try again.`;
}

function getAuthToken() {
    try {
        const raw = window.localStorage.getItem("knowledge_assistant_auth");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed ? parsed.token : null;
    } catch (_error) {
        return null;
    }
}

function authHeaders(extra = {}) {
    const token = getAuthToken();
    return token ?
        { Authorization: `Bearer ${token}`, ...extra } :
        {...extra };
}

async function parseResponse(response, fallbackMessage) {
    let data = {};

    try {
        data = await response.json();
    } catch (_error) {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.detail || fallbackMessage);
    }
    return data;
}

async function requestJson(url, options, fallbackMessage) {
    const mergedOptions = {
        ...options,
        headers: authHeaders((options && options.headers) ? options.headers : {}),
    };
    try {
        const response = await fetch(url, mergedOptions);
        return await parseResponse(response, fallbackMessage);
    } catch (error) {
        if (error instanceof TypeError) {
            throw new Error(networkErrorMessage());
        }
        throw error;
    }
}

function workspacePath(workspaceId, suffix = "") {
    return `${API_BASE_URL}/workspaces/${workspaceId}${suffix}`;
}

export async function fetchWorkspaces() {
    return requestJson(`${API_BASE_URL}/workspaces`, undefined, "Failed to load workspaces.");
}

export async function createWorkspace(workspaceName) {
    return requestJson(
        `${API_BASE_URL}/workspaces`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace_name: workspaceName }),
        },
        "Failed to create workspace."
    );
}

export async function deleteWorkspace(workspaceId) {
    return requestJson(
        `${API_BASE_URL}/workspaces/${workspaceId}`, { method: "DELETE" },
        "Failed to delete workspace."
    );
}

export async function fetchDocuments(workspaceId) {
    return requestJson(
        workspacePath(workspaceId, "/documents"),
        undefined,
        "Failed to load documents."
    );
}

export async function fetchCollections(workspaceId) {
    return requestJson(
        workspacePath(workspaceId, "/collections"),
        undefined,
        "Failed to load collections."
    );
}

export async function fetchWorkspaceOverview(workspaceId) {
    return requestJson(
        workspacePath(workspaceId, "/overview"),
        undefined,
        "Failed to load workspace overview."
    );
}

export async function createCollection(workspaceId, collectionName) {
    return requestJson(
        workspacePath(workspaceId, "/collections"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collection_name: collectionName }),
        },
        "Failed to create collection."
    );
}

export async function deleteCollection(workspaceId, collectionId) {
    return requestJson(
        workspacePath(workspaceId, `/collections/${collectionId}`), { method: "DELETE" },
        "Failed to delete collection."
    );
}

export async function fetchDocumentPreview(workspaceId, documentId) {
    return requestJson(
        workspacePath(workspaceId, `/documents/${documentId}/preview`),
        undefined,
        "Failed to load document preview."
    );
}

export async function fetchDocumentSummary(workspaceId, documentId) {
    return requestJson(
        workspacePath(workspaceId, `/documents/${documentId}/summary`),
        undefined,
        "Failed to load document summary."
    );
}

export async function reindexDocument(workspaceId, documentId) {
    return requestJson(
        workspacePath(workspaceId, "/documents/reindex"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document_id: documentId }),
        },
        "Reindex failed."
    );
}

export function uploadDocument(
    workspaceId,
    file,
    onProgress,
    conversationId = "",
    collectionId = ""
) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append("file", file);
        if (conversationId) {
            formData.append("conversation_id", conversationId);
        }
        if (collectionId) {
            formData.append("collection_id", collectionId);
        }

        const request = new XMLHttpRequest();
        request.open("POST", workspacePath(workspaceId, "/upload"));
        const token = getAuthToken();
        if (token) {
            request.setRequestHeader("Authorization", `Bearer ${token}`);
        }

        request.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable && onProgress) {
                onProgress(Math.round((event.loaded / event.total) * 100));
            }
        });

        request.addEventListener("load", () => {
            try {
                const data = JSON.parse(request.responseText);
                if (request.status >= 200 && request.status < 300) {
                    resolve(data);
                    return;
                }
                reject(new Error(data.detail || "Upload failed."));
            } catch (_error) {
                reject(new Error("Upload failed."));
            }
        });

        request.addEventListener("error", () => reject(new Error(networkErrorMessage())));
        request.send(formData);
    });
}

export async function deleteDocument(workspaceId, documentId) {
    return requestJson(
        workspacePath(workspaceId, `/documents/${documentId}`), { method: "DELETE" },
        "Delete failed."
    );
}

export async function moveDocumentToCollection(workspaceId, documentId, collectionId) {
    return requestJson(
        workspacePath(workspaceId, `/documents/${documentId}/move`), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collection_id: collectionId }),
        },
        "Failed to move document."
    );
}

export async function queryKnowledge(workspaceId, question, conversationId) {
    const sessionStorageKey = `session_id:${workspaceId}`;
    return requestJson(
        workspacePath(workspaceId, "/query"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                question,
                conversation_id: conversationId || null,
                session_id: window.sessionStorage.getItem(sessionStorageKey),
            }),
        },
        "Query failed."
    );
}

/**
 * Stream a knowledge query over SSE.
 *
 * Handler callbacks:
 *   onMeta({ conversation_id, session_id, sources, insights, themes, ... })
 *     — fired once before the first token; sources are available immediately.
 *   onChunk({ delta })
 *     — fired for every token delta from the LLM. Append to your display buffer.
 *   onDone({ answer, confidence, debug, sources, ... })
 *     — fired once at the end with the complete assembled response.
 */
export async function streamKnowledgeQuery(
    workspaceId,
    question,
    conversationId,
    handlers = {}
) {
    const sessionStorageKey = `session_id:${workspaceId}`;
    let response;
    try {
        response = await fetch(workspacePath(workspaceId, "/query/stream"), {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
                question,
                conversation_id: conversationId || null,
                session_id: window.sessionStorage.getItem(sessionStorageKey),
            }),
        });
    } catch (_error) {
        throw new Error(networkErrorMessage());
    }

    if (!response.ok) {
        let data = {};
        try {
            data = await response.json();
        } catch (_error) {
            data = {};
        }
        throw new Error(data.detail || "Query failed.");
    }

    const reader = response.body ? response.body.getReader() : null;
    const decoder = new TextDecoder();
    let buffer = "";

    while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const eventBlock of events) {
            const lines = eventBlock.split("\n");
            const eventLine = lines.find((line) => line.startsWith("event: "));
            const dataLine = lines.find((line) => line.startsWith("data: "));
            if (!eventLine || !dataLine) continue;

            const eventName = eventLine.replace("event: ", "").trim();
            const payload = JSON.parse(dataLine.replace("data: ", ""));

            if (eventName === "meta") {
                if (handlers.onMeta) handlers.onMeta(payload);
            } else if (eventName === "chunk") {
                if (handlers.onChunk) handlers.onChunk({ delta: payload.content });
            } else if (eventName === "done") {
                if (handlers.onDone) handlers.onDone(payload);
            }
        }
    }
}

export async function searchDocuments(workspaceId, query) {
    return requestJson(
        `${workspacePath(workspaceId, "/search")}?q=${encodeURIComponent(query)}`,
        undefined,
        "Search failed."
    );
}

export async function fetchKnowledgeGraph(workspaceId, conversationId = "") {
    const suffix = conversationId ?
        `/knowledge-graph?conversation_id=${encodeURIComponent(conversationId)}` :
        "/knowledge-graph";
    return requestJson(
        workspacePath(workspaceId, suffix),
        undefined,
        "Failed to load knowledge graph."
    );
}

export async function fetchDocumentGraph(workspaceId, documentIds) {
    const docs = encodeURIComponent(documentIds.join(","));
    return requestJson(
        `${workspacePath(workspaceId, "/document-graph")}?docs=${docs}`,
        undefined,
        "Failed to load document graph."
    );
}