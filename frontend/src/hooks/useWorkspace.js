import { useCallback, useEffect, useState } from "react";
import {
    createCollection,
    createWorkspace,
    deleteCollection,
    deleteWorkspace,
    fetchCollections,
    fetchWorkspaceOverview,
    fetchWorkspaces,
} from "../services/api";

var ACTIVE_WORKSPACE_KEY = "active_workspace_id";

export function useWorkspace() {
    var _useState = useState([]);
    var workspaces = _useState[0];
    var setWorkspaces = _useState[1];

    var _useState2 = useState(function() { return window.localStorage.getItem(ACTIVE_WORKSPACE_KEY) || ""; });
    var activeWorkspaceId = _useState2[0];
    var setActiveWorkspaceIdState = _useState2[1];

    var _useState3 = useState([]);
    var collections = _useState3[0];
    var setCollections = _useState3[1];

    var _useState4 = useState("");
    var activeCollectionId = _useState4[0];
    var setActiveCollectionId = _useState4[1];

    var _useState5 = useState(null);
    var workspaceOverview = _useState5[0];
    var setWorkspaceOverview = _useState5[1];

    var _useState6 = useState(true);
    var isBackendReachable = _useState6[0];
    var setIsBackendReachable = _useState6[1];

    var _useState7 = useState("");
    var status = _useState7[0];
    var setStatus = _useState7[1];

    var activeWorkspace = workspaces.find(function(w) { return w.workspace_id === activeWorkspaceId; }) || null;
    var activeCollection = collections.find(function(c) { return c.collection_id === activeCollectionId; }) || null;

    var setActiveWorkspaceId = useCallback(function(id) {
        setActiveWorkspaceIdState(id);
        if (id) {
            window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, id);
        } else {
            window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
        }
    }, []);

    var loadWorkspaces = useCallback(async function(preferredId) {
        try {
            var data = await fetchWorkspaces();
            var list = data.workspaces || [];
            setIsBackendReachable(true);
            setWorkspaces(list);
            var matchesCurrent = list.some(function(w) { return w.workspace_id === activeWorkspaceId; });
            var next = preferredId || (matchesCurrent ? activeWorkspaceId : (list[0] ? list[0].workspace_id : ""));
            setActiveWorkspaceId(next);
            setStatus("");
            return list;
        } catch (err) {
            setIsBackendReachable(false);
            setWorkspaces([]);
            setActiveWorkspaceId("");
            setStatus(err.message);
            return [];
        }
    }, [activeWorkspaceId, setActiveWorkspaceId]);

    var loadCollections = useCallback(async function(workspaceId) {
        try {
            var data = await fetchCollections(workspaceId);
            var list = data.collections || [];
            setCollections(list);
            setActiveCollectionId(function(prev) {
                return list.some(function(c) { return c.collection_id === prev; }) ? prev : "";
            });
        } catch (err) {
            setStatus(err.message);
        }
    }, []);

    var loadOverview = useCallback(async function(workspaceId) {
        try {
            var data = await fetchWorkspaceOverview(workspaceId);
            setWorkspaceOverview(data);
        } catch (_err) {
            // non-critical
        }
    }, []);

    useEffect(function() {
        if (!activeWorkspaceId) {
            setCollections([]);
            setActiveCollectionId("");
            setWorkspaceOverview(null);
            return;
        }
        loadCollections(activeWorkspaceId);
        loadOverview(activeWorkspaceId);
    }, [activeWorkspaceId, loadCollections, loadOverview]);

    var handleCreateWorkspace = useCallback(async function(name) {
        var workspace = await createWorkspace(name.trim());
        setWorkspaces(function(prev) { return prev.concat([workspace]); });
        setActiveWorkspaceId(workspace.workspace_id);
        setIsBackendReachable(true);
        setStatus("Workspace created successfully");
        return workspace;
    }, [setActiveWorkspaceId]);

    var handleDeleteWorkspace = useCallback(async function() {
        if (!activeWorkspace) return false;
        await deleteWorkspace(activeWorkspaceId);
        var remaining = workspaces.filter(function(w) { return w.workspace_id !== activeWorkspaceId; });
        setWorkspaces(remaining);
        var fallback = remaining[0] ? remaining[0].workspace_id : "";
        setActiveWorkspaceId(fallback);
        setStatus("Workspace removed");
        return fallback;
    }, [activeWorkspace, activeWorkspaceId, workspaces, setActiveWorkspaceId]);

    var handleCreateCollection = useCallback(async function(name) {
        var collection = await createCollection(activeWorkspaceId, name.trim());
        setCollections(function(prev) {
            return prev.some(function(c) { return c.collection_id === collection.collection_id; }) ?
                prev :
                prev.concat([collection]);
        });
        setActiveCollectionId(collection.collection_id);
        await loadOverview(activeWorkspaceId);
        setStatus("Collection created");
        return collection;
    }, [activeWorkspaceId, loadOverview]);

    var handleDeleteCollection = useCallback(async function() {
        if (!activeCollectionId || !activeCollection) return;
        var response = await deleteCollection(activeWorkspaceId, activeCollectionId);
        setActiveCollectionId("");
        await loadCollections(activeWorkspaceId);
        await loadOverview(activeWorkspaceId);
        setStatus("Collection removed. " + response.moved_document_count + " document(s) moved to General.");
    }, [activeWorkspaceId, activeCollectionId, activeCollection, loadCollections, loadOverview]);

    return {
        workspaces: workspaces,
        activeWorkspaceId: activeWorkspaceId,
        setActiveWorkspaceId: setActiveWorkspaceId,
        activeWorkspace: activeWorkspace,
        collections: collections,
        activeCollectionId: activeCollectionId,
        setActiveCollectionId: setActiveCollectionId,
        activeCollection: activeCollection,
        workspaceOverview: workspaceOverview,
        isBackendReachable: isBackendReachable,
        status: status,
        setStatus: setStatus,
        loadWorkspaces: loadWorkspaces,
        loadCollections: loadCollections,
        loadOverview: loadOverview,
        handleCreateWorkspace: handleCreateWorkspace,
        handleDeleteWorkspace: handleDeleteWorkspace,
        handleCreateCollection: handleCreateCollection,
        handleDeleteCollection: handleDeleteCollection,
    };
}