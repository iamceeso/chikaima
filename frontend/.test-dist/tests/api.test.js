"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const originalFetch = global.fetch;
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
function restoreEnvironment() {
    global.fetch = originalFetch;
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
    await strict_1.default.rejects(() => api.getWorkspaceSettings("token-123"), (error) => error instanceof Error && error.message === "Workspace unavailable");
});
(0, node_test_1.default)("api.getProviders turns aborts into a timeout message", async () => {
    global.fetch = async () => {
        throw new DOMException("timeout", "AbortError");
    };
    const { api } = await importApi();
    await strict_1.default.rejects(() => api.getProviders("token-123"), (error) => error instanceof Error &&
        error.message === "Request timed out. Check that the backend is running.");
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
