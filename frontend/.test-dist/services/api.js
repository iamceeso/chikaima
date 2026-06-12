"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const env_1 = require("../lib/env");
const REQUEST_TIMEOUT_MS = 10_000;
async function request(path, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    if (options.authHeader) {
        headers.set("Authorization", options.authHeader);
    }
    else if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${env_1.env.apiBaseUrl}${path}`, {
            ...options,
            headers,
            cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
            signal: options.signal ?? controller.signal,
        });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("Request timed out. Check that the backend is running.");
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        const body = await response.text();
        let message = body || "Request failed";
        if (body.trim().startsWith("{")) {
            try {
                const parsed = JSON.parse(body);
                message = parsed.detail || message;
            }
            catch {
                message = body || "Request failed";
            }
        }
        throw new Error(message);
    }
    return response.status === 204 ? undefined : (await response.json());
}
async function requestBlob(path, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers);
    if (options.authHeader) {
        headers.set("Authorization", options.authHeader);
    }
    else if (options.token) {
        headers.set("Authorization", `Bearer ${options.token}`);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${env_1.env.apiBaseUrl}${path}`, {
            ...options,
            headers,
            cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
            signal: options.signal ?? controller.signal,
        });
    }
    catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("Request timed out. Check that the backend is running.");
        }
        throw error;
    }
    finally {
        clearTimeout(timeoutId);
    }
    if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Request failed");
    }
    return response.blob();
}
exports.api = {
    getPublicWorkspaceSettings: () => request("/settings/public"),
    register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
    login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
    logout: (token) => request("/auth/logout", { method: "POST", token }),
    getProfile: (token) => request("/users/me", { token }),
    getUsers: (access) => request("/users", access),
    createUser: (access, payload) => request("/users", { method: "POST", ...access, body: JSON.stringify(payload) }),
    updateUser: (access, userId, payload) => request(`/users/${userId}`, { method: "PATCH", ...access, body: JSON.stringify(payload) }),
    deleteUser: (access, userId) => request(`/users/${userId}`, { method: "DELETE", ...access }),
    getDashboard: (token) => request("/dashboard", { token }),
    getWorkspaceSettings: (access) => request("/settings/workspace", access),
    updateWorkspaceSettings: (access, payload) => request("/settings/workspace", { method: "PATCH", ...access, body: JSON.stringify(payload) }),
    getWorkspaceModels: (access) => request("/settings/models", access),
    updateWorkspaceModels: (access, payload) => request("/settings/models", { method: "PATCH", ...access, body: JSON.stringify(payload) }),
    getProviders: (access) => request("/providers", access),
    createProvider: (access, payload) => request("/providers", { method: "POST", ...access, body: JSON.stringify(payload) }),
    updateProvider: (access, providerId, payload) => request(`/providers/${providerId}`, { method: "PATCH", ...access, body: JSON.stringify(payload) }),
    deleteProvider: (access, providerId) => request(`/providers/${providerId}`, { method: "DELETE", ...access }),
    getModels: (token) => request("/models", { token }),
    getLibraryBundle: (token) => request("/library", { token }),
    getAssetFile: (token, resourceType, resourceId) => requestBlob(`/assets/${resourceType}/${resourceId}/file`, { token }),
    getDocuments: (token) => request("/documents", { token }),
    deleteDocument: (token, documentId) => request(`/documents/${documentId}`, { method: "DELETE", token }),
    clearDocuments: (token) => request("/documents", { method: "DELETE", token }),
    uploadDocument: (token, file) => {
        const formData = new FormData();
        formData.append("file", file);
        return request("/documents/upload", { method: "POST", token, body: formData });
    },
    getAudioAssets: (token) => request("/audio", { token }),
    deleteAudioAsset: (token, audioId) => request(`/audio/${audioId}`, { method: "DELETE", token }),
    clearAudioAssets: (token) => request("/audio", { method: "DELETE", token }),
    uploadAudio: (token, file) => {
        const formData = new FormData();
        formData.append("file", file);
        return request("/audio/upload", { method: "POST", token, body: formData });
    },
    getVideos: (token) => request("/video", { token }),
    getTranscript: (token, resourceType, resourceId) => {
        if (resourceType === "document") {
            return request(`/documents/${resourceId}/transcript`, { token });
        }
        if (resourceType === "audio") {
            return request(`/audio/${resourceId}/transcript`, { token });
        }
        return request(`/video/${resourceId}/transcript`, { token });
    },
    deleteVideo: (token, videoId) => request(`/video/${videoId}`, { method: "DELETE", token }),
    clearVideos: (token) => request("/video", { method: "DELETE", token }),
    uploadVideo: (token, file) => {
        const formData = new FormData();
        formData.append("file", file);
        return request("/video/upload", { method: "POST", token, body: formData });
    },
    getConversations: (token) => request("/chat/conversations", { token }),
    createConversation: (token, payload) => request("/chat/conversations", { method: "POST", token, body: JSON.stringify(payload) }),
    deleteConversation: (token, conversationId) => request(`/chat/conversations/${conversationId}`, { method: "DELETE", token }),
    sendMessage: (token, conversationId, payload) => request(`/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        token,
        body: JSON.stringify(payload),
    }),
    updateMessage: (token, messageId, payload) => request(`/chat/messages/${messageId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(payload),
    }),
    regenerateMessage: (token, payload) => request(`/chat/messages/regenerate`, {
        method: "POST",
        token,
        body: JSON.stringify(payload),
    }),
    streamChat: async (token, payload, handlers = {}) => {
        const headers = new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
        const response = await fetch(`${env_1.env.apiBaseUrl}/chat/stream`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            cache: "no-store",
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(body || "Streaming request failed");
        }
        if (!response.body) {
            throw new Error("Streaming response body is unavailable.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const emitEvent = (eventName, data) => {
            if (!data.trim()) {
                return;
            }
            let parsed = {};
            try {
                parsed = JSON.parse(data);
            }
            catch {
                parsed = { detail: data };
            }
            if (eventName === "metadata") {
                handlers.onMetadata?.(parsed);
                return;
            }
            if (eventName === "token") {
                const text = parsed.text;
                if (typeof text === "string") {
                    handlers.onToken?.(text);
                }
                return;
            }
            if (eventName === "done") {
                handlers.onDone?.();
                return;
            }
            if (eventName === "error") {
                handlers.onError?.(typeof parsed.detail === "string" ? parsed.detail : "Streaming failed");
            }
        };
        while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            let boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex !== -1) {
                const rawEvent = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + 2);
                const lines = rawEvent.split("\n");
                let eventName = "message";
                const dataLines = [];
                for (const line of lines) {
                    if (line.startsWith("event:")) {
                        eventName = line.slice(6).trim();
                    }
                    else if (line.startsWith("data:")) {
                        dataLines.push(line.slice(5).trim());
                    }
                }
                emitEvent(eventName, dataLines.join("\n"));
                boundaryIndex = buffer.indexOf("\n\n");
            }
            if (done) {
                break;
            }
        }
    },
    getJobs: (token) => request("/jobs", { token }),
};
