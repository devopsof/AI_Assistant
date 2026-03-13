import { useCallback, useEffect, useState } from "react";
import {
    deleteDocument,
    fetchDocumentPreview,
    fetchDocuments,
    moveDocumentToCollection,
    reindexDocument,
    uploadDocument,
} from "../services/api";

export function useDocuments(activeWorkspaceId, activeCollectionId, activeConversationLocalId, onStatusChange) {
    var _useState = useState([]);
    var documents = _useState[0];
    var setDocuments = _useState[1];

    var _useState2 = useState(null);
    var preview = _useState2[0];
    var setPreview = _useState2[1];

    var _useState3 = useState(false);
    var isUploading = _useState3[0];
    var setIsUploading = _useState3[1];

    var _useState4 = useState(0);
    var uploadProgress = _useState4[0];
    var setUploadProgress = _useState4[1];

    var filteredDocuments = activeCollectionId ?
        documents.filter(function(doc) { return doc.collection_id === activeCollectionId; }) :
        documents;

    var loadDocuments = useCallback(async function(workspaceId) {
        if (!workspaceId) {
            setDocuments([]);
            return;
        }
        try {
            var data = await fetchDocuments(workspaceId);
            setDocuments(data.documents || []);
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        }
    }, [onStatusChange]);

    useEffect(function() {
        loadDocuments(activeWorkspaceId);
    }, [activeWorkspaceId, loadDocuments]);

    var handleUpload = useCallback(async function(file) {
        if (!file || !activeWorkspaceId) return;
        if (!activeConversationLocalId) {
            if (onStatusChange) onStatusChange("Create or choose a chat before uploading a document.");
            return;
        }
        try {
            setIsUploading(true);
            setUploadProgress(0);
            if (onStatusChange) onStatusChange("Uploading document...");
            var response = await uploadDocument(
                activeWorkspaceId,
                file,
                setUploadProgress,
                activeConversationLocalId,
                activeCollectionId
            );
            if (onStatusChange) {
                onStatusChange(
                    response.duplicate ?
                    response.document_name + " is already in this workspace." :
                    response.document_name + " indexed successfully."
                );
            }
            await loadDocuments(activeWorkspaceId);
            return response;
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        } finally {
            setIsUploading(false);
        }
    }, [activeWorkspaceId, activeConversationLocalId, activeCollectionId, loadDocuments, onStatusChange]);

    var handlePreview = useCallback(async function(documentId) {
        try {
            var response = await fetchDocumentPreview(activeWorkspaceId, documentId);
            setPreview(response);
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        }
    }, [activeWorkspaceId, onStatusChange]);

    var handleDelete = useCallback(async function(documentId) {
        try {
            await deleteDocument(activeWorkspaceId, documentId);
            if (preview && preview.document_id === documentId) setPreview(null);
            if (onStatusChange) onStatusChange("Document removed");
            await loadDocuments(activeWorkspaceId);
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        }
    }, [activeWorkspaceId, preview, loadDocuments, onStatusChange]);

    var handleReindex = useCallback(async function(documentId) {
        try {
            var response = await reindexDocument(activeWorkspaceId, documentId);
            if (onStatusChange) onStatusChange("Document reindexed (" + response.chunks_stored + " chunks)");
            await loadDocuments(activeWorkspaceId);
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        }
    }, [activeWorkspaceId, loadDocuments, onStatusChange]);

    var handleMove = useCallback(async function(documentId, collectionId) {
        try {
            await moveDocumentToCollection(activeWorkspaceId, documentId, collectionId);
            await loadDocuments(activeWorkspaceId);
            if (onStatusChange) onStatusChange("Document moved");
        } catch (err) {
            if (onStatusChange) onStatusChange(err.message);
        }
    }, [activeWorkspaceId, loadDocuments, onStatusChange]);

    return {
        documents: documents,
        filteredDocuments: filteredDocuments,
        preview: preview,
        setPreview: setPreview,
        isUploading: isUploading,
        uploadProgress: uploadProgress,
        loadDocuments: loadDocuments,
        handleUpload: handleUpload,
        handlePreview: handlePreview,
        handleDelete: handleDelete,
        handleReindex: handleReindex,
        handleMove: handleMove,
    };
}