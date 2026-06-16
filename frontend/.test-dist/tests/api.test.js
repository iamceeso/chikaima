"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
function restoreEnvironment() {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    if (originalApiBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    else {
        process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
}
async function importApi() {
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://api.example.com";
    return import(`../services/api.js?case=${Math.random()}`);
}
node_test_1.default.afterEach(() => {
    restoreEnvironment();
});
(0, node_test_1.default)("api.getProfile attaches auth headers and parses JSON", async () => {
    let capturedRequest;
    let capturedUrl = "";
    global.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedRequest = init;
        return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    const { api } = await importApi();
    const payload = await api.getProfile("token-123");
    strict_1.default.equal(capturedUrl, "https://api.example.com/users/me");
    strict_1.default.equal((capturedRequest?.headers).get("Authorization"), "Bearer token-123");
    strict_1.default.equal(payload.id, "user-1");
});
(0, node_test_1.default)("api.deleteConversation resolves undefined for 204 responses", async () => {
    global.fetch = async () => new Response(null, { status: 204 });
    const { api } = await importApi();
    const result = await api.deleteConversation("token-123", "conversation-1");
    strict_1.default.equal(result, undefined);
});
(0, node_test_1.default)("api.getWorkspaceSettings surfaces backend detail messages", async () => {
    global.fetch = async () => new Response(JSON.stringify({ detail: "Workspace unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
    });
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getWorkspaceSettings({ token: "token-123" }), (error) => error instanceof Error && error.message === "Workspace unavailable");
});
(0, node_test_1.default)("api.getWorkspaceSettings prefers explicit authorization headers", async () => {
    let capturedRequest;
    global.fetch = async (_input, init) => {
        capturedRequest = init;
        return new Response(JSON.stringify({ id: "workspace-1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    const { api } = await importApi();
    await api.getWorkspaceSettings({ token: "token-123", authHeader: "Basic abc123" });
    strict_1.default.equal((capturedRequest?.headers).get("Authorization"), "Basic abc123");
});
(0, node_test_1.default)("api.getProviders turns aborts into a timeout message", async () => {
    global.fetch = async () => {
        throw new DOMException("timeout", "AbortError");
    };
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getProviders({ token: "token-123" }), (error) => error instanceof Error &&
        error.message === "Request timed out. Check that the backend is running.");
});
(0, node_test_1.default)("api request rethrows non-timeout fetch failures", async () => {
    global.fetch = async () => {
        throw new Error("Socket closed");
    };
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getPublicWorkspaceSettings(), (error) => error instanceof Error && error.message === "Socket closed");
});
(0, node_test_1.default)("api.streamChat emits metadata tokens done and error events", async () => {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode([
                'event: metadata\ndata: {"conversation_id":"conv-1"}\n\n',
                'event: token\ndata: {"text":"Hello"}\n\n',
                "event: done\ndata: {}\n\n",
                'event: error\ndata: {"detail":"partial failure"}\n\n',
            ].join("")));
            controller.close();
        },
    });
    global.fetch = async () => new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    });
    const { api } = await importApi();
    const seen = [];
    await api.streamChat("token-123", { content: "Hi there" }, {
        onMetadata: (metadata) => seen.push(`metadata:${String(metadata.conversation_id)}`),
        onToken: (text) => seen.push(`token:${text}`),
        onDone: () => seen.push("done"),
        onError: (message) => seen.push(`error:${message}`),
    });
    strict_1.default.deepEqual(seen, [
        "metadata:conv-1",
        "token:Hello",
        "done",
        "error:partial failure",
    ]);
});
(0, node_test_1.default)("api.streamChat fails clearly when response body is missing", async () => {
    global.fetch = async () => new Response(null, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    });
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.streamChat("token-123", { content: "Hi" }), (error) => error instanceof Error && error.message === "Streaming response body is unavailable.");
});
(0, node_test_1.default)("api.streamChat handles chunked events and fallback error parsing", async () => {
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('event: token\ndata: {"text":'));
            controller.enqueue(encoder.encode('"Split"}\n\n'));
            controller.enqueue(encoder.encode("event: token\ndata: {\"count\":1}\n\n"));
            controller.enqueue(encoder.encode("event: error\ndata: {}\n\n"));
            controller.enqueue(encoder.encode("event: message\ndata: plain text fallback\n\n"));
            controller.enqueue(encoder.encode("event: metadata\ndata:   \n\n"));
            controller.close();
        },
    });
    global.fetch = async () => new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
    });
    const { api } = await importApi();
    const seen = [];
    await api.streamChat("token-123", { content: "Hi there" }, {
        onToken: (text) => seen.push(`token:${text}`),
        onError: (message) => seen.push(`error:${message}`),
    });
    strict_1.default.deepEqual(seen, ["token:Split", "error:Streaming failed"]);
});
(0, node_test_1.default)("api.streamChat surfaces non-ok streaming responses", async () => {
    global.fetch = async () => new Response("", { status: 500 });
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.streamChat("token-123", { content: "Hi" }), (error) => error instanceof Error && error.message === "Streaming request failed");
});
(0, node_test_1.default)("api request helpers cover auth, json, blob, and upload wrappers", async () => {
    const requests = [];
    global.fetch = async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).includes("/assets/")) {
            return new Response("blob-content", {
                status: 200,
                headers: { "Content-Type": "application/octet-stream" },
            });
        }
        return new Response(JSON.stringify({ ok: true, id: "resource-1", content: "Transcript body" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    const { api } = await importApi();
    await api.register({ email: "a@example.com", full_name: "User A", password: "password123" });
    await api.login({ email: "a@example.com", password: "password123" });
    await api.logout("token-1");
    await api.getUsers({ token: "token-1" });
    await api.createUser({ token: "token-1" }, { email: "b@example.com", full_name: "User B", password: "password123" });
    await api.updateUser({ token: "token-1" }, "user-1", { full_name: "Updated User" });
    await api.deleteUser({ token: "token-1" }, "user-1");
    await api.getDashboard("token-1");
    await api.updateWorkspaceSettings({ token: "token-1" }, { name: "Workspace", docs_enabled: true });
    await api.getWorkspaceModels({ token: "token-1" });
    await api.updateWorkspaceModels({ token: "token-1" }, { enabled_model_ids: ["model-1"], default_model_id: "model-1" });
    await api.createProvider({ token: "token-1" }, { name: "Provider", provider_type: "openai", api_key: "secret" });
    await api.updateProvider({ token: "token-1" }, "provider-1", { name: "Updated provider" });
    await api.deleteProvider({ token: "token-1" }, "provider-1");
    await api.getModels("token-1");
    await api.getLibraryBundle("token-1");
    const assetBlob = await api.getAssetFile("token-1", "document", "doc-1");
    await api.getDocuments("token-1");
    await api.deleteDocument("token-1", "doc-1");
    await api.clearDocuments("token-1");
    await api.uploadDocument("token-1", new File(["hello"], "notes.txt", { type: "text/plain" }));
    await api.getAudioAssets("token-1");
    await api.deleteAudioAsset("token-1", "audio-1");
    await api.clearAudioAssets("token-1");
    await api.uploadAudio("token-1", new File(["audio"], "clip.mp3", { type: "audio/mpeg" }));
    await api.getVideos("token-1");
    await api.getTranscript("token-1", "document", "doc-1");
    await api.getTranscript("token-1", "audio", "audio-1");
    await api.getTranscript("token-1", "video", "video-1");
    await api.deleteVideo("token-1", "video-1");
    await api.clearVideos("token-1");
    await api.uploadVideo("token-1", new File(["video"], "clip.mp4", { type: "video/mp4" }));
    await api.getConversations("token-1");
    await api.createConversation("token-1", { title: "New chat", initial_message: "Hello" });
    await api.sendMessage("token-1", "conversation-1", { role: "user", content: "Hi" });
    await api.updateMessage("token-1", "message-1", { content: "Updated" });
    await api.regenerateMessage("token-1", { message_id: "message-1" });
    await api.getJobs("token-1");
    strict_1.default.equal(await assetBlob.text(), "blob-content");
    strict_1.default.ok(requests.some(({ url, init }) => url === "https://api.example.com/auth/register" && init?.method === "POST"));
    strict_1.default.ok(requests.some(({ url, init }) => url === "https://api.example.com/auth/logout" && (init?.headers).get("Authorization") === "Bearer token-1"));
    strict_1.default.ok(requests.some(({ url }) => url === "https://api.example.com/assets/document/doc-1/file"));
    strict_1.default.ok(requests.some(({ url, init }) => url === "https://api.example.com/documents/upload" &&
        init?.method === "POST" &&
        init.body instanceof FormData));
    strict_1.default.ok(requests.some(({ url, init }) => url === "https://api.example.com/chat/conversations" &&
        init?.method === "POST" &&
        typeof init.body === "string" &&
        init.body.includes("\"title\":\"New chat\"")));
});
(0, node_test_1.default)("api request surfaces non-json backend errors and requestBlob timeout", async () => {
    let call = 0;
    global.fetch = async (input) => {
        call += 1;
        if (call === 1) {
            return new Response("Gateway exploded", { status: 502 });
        }
        if (call === 2) {
            return new Response("{not valid json", { status: 500 });
        }
        if (String(input).includes("/assets/")) {
            throw new DOMException("timeout", "AbortError");
        }
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getDashboard("token-1"), (error) => error instanceof Error && error.message === "Gateway exploded");
    await strict_1.default.rejects(() => api.getUsers({ token: "token-1" }), (error) => error instanceof Error && error.message === "{not valid json");
    await strict_1.default.rejects(() => api.getAssetFile("token-1", "video", "video-1"), (error) => error instanceof Error && error.message === "Request timed out. Check that the backend is running.");
});
(0, node_test_1.default)("api request falls back to the original json body when detail is missing", async () => {
    global.fetch = async () => new Response(JSON.stringify({ message: "No detail field" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
    });
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getUsers({ token: "token-1" }), (error) => error instanceof Error && error.message === JSON.stringify({ message: "No detail field" }));
});
(0, node_test_1.default)("api.getAssetFile surfaces non-timeout and non-ok blob failures", async () => {
    let call = 0;
    global.fetch = async () => {
        call += 1;
        if (call === 1) {
            throw new Error("Socket closed");
        }
        return new Response("", { status: 500 });
    };
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getAssetFile("token-1", "document", "doc-1"), (error) => error instanceof Error && error.message === "Socket closed");
    await strict_1.default.rejects(() => api.getAssetFile("token-1", "document", "doc-1"), (error) => error instanceof Error && error.message === "Request failed");
});
(0, node_test_1.default)("api private request helpers preserve explicit fetch options and cover blob authHeader errors", async () => {
    const requests = [];
    const customSignal = new AbortController().signal;
    global.fetch = async (input, init) => {
        requests.push({ url: String(input), init });
        if (String(input).includes("/blob-error")) {
            throw new Error("Socket closed");
        }
        if (String(input).includes("/blob-ok")) {
            return new Response("blob-content", {
                status: 200,
                headers: { "Content-Type": "application/octet-stream" },
            });
        }
        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    const { apiTestUtils } = await importApi();
    await apiTestUtils.request("/custom", {
        method: "POST",
        body: JSON.stringify({ ok: true }),
        headers: { "Content-Type": "application/custom+json" },
        cache: "reload",
        signal: customSignal,
    });
    await strict_1.default.rejects(() => apiTestUtils.requestBlob("/blob-error", { authHeader: "Basic abc123" }), (error) => error instanceof Error && error.message === "Socket closed");
    const blob = await apiTestUtils.requestBlob("/blob-ok", { authHeader: "Basic abc123" });
    strict_1.default.equal(await blob.text(), "blob-content");
    strict_1.default.equal(requests[0]?.url, "https://api.example.com/custom");
    strict_1.default.equal(requests[0]?.init?.cache, "reload");
    strict_1.default.equal(requests[0]?.init?.signal, customSignal);
    strict_1.default.equal((requests[0]?.init?.headers).get("Content-Type"), "application/custom+json");
    strict_1.default.equal((requests[0]?.init?.headers).get("Authorization"), null);
    strict_1.default.equal((requests[1]?.init?.headers).get("Authorization"), "Basic abc123");
    strict_1.default.equal((requests[2]?.init?.headers).get("Authorization"), "Basic abc123");
});
(0, node_test_1.default)("api helper timeouts invoke abort callbacks for request and requestBlob", async () => {
    const timeoutCallbacks = [];
    const clearedTimeouts = [];
    global.setTimeout = ((callback) => {
        timeoutCallbacks.push(callback);
        return timeoutCallbacks.length;
    });
    global.clearTimeout = ((timeoutId) => {
        clearedTimeouts.push(timeoutId);
    });
    global.fetch = async () => new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
    const { apiTestUtils } = await importApi();
    await apiTestUtils.request("/timeout-callback");
    global.fetch = async () => new Response("blob-content", {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
    });
    await apiTestUtils.requestBlob("/timeout-callback-blob");
    strict_1.default.equal(timeoutCallbacks.length, 2);
    timeoutCallbacks.forEach((callback) => callback());
    strict_1.default.deepEqual(clearedTimeouts, [1, 2]);
});
