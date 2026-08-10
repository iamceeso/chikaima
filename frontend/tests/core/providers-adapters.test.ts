import assert from "node:assert/strict";
import test from "node:test";

import { AnthropicAdapter } from "../../core/providers/adapters/anthropic.js";
import { OllamaAdapter } from "../../core/providers/adapters/ollama.js";
import { OpenAIAdapter } from "../../core/providers/adapters/openai.js";
import { HttpError } from "../../core/errors.js";

async function withMockedFetch<T>(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function sseResponse(events: string[]): Response {
  const body = events.map((event) => `data: ${event}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

test("OpenAIAdapter.generateReply posts normalized messages and extracts assistant text", async () => {
  let capturedBody: unknown = null;
  const adapter = new OpenAIAdapter({ apiKey: "sk-test", providerLabel: "OpenAI" });

  const reply = await withMockedFetch(
    async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "hello there" } }] }), { status: 200 });
    },
    () => adapter.generateReply("gpt-4o-mini", [{ role: "user", content: "hi" }]),
  );

  assert.equal(reply, "hello there");
  assert.deepEqual(capturedBody, { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] });
});

test("OpenAIAdapter.generateReply raises a 502 HttpError on a non-2xx response", async () => {
  const adapter = new OpenAIAdapter({ apiKey: "sk-test", providerLabel: "OpenAI" });

  await assert.rejects(
    () =>
      withMockedFetch(
        async () => new Response("rate limited", { status: 429 }),
        () => adapter.generateReply("gpt-4o-mini", [{ role: "user", content: "hi" }]),
      ),
    (error: unknown) => error instanceof HttpError && error.statusCode === 502 && error.detail === "rate limited",
  );
});

test("OpenAIAdapter.streamReply yields token deltas parsed from the SSE stream", async () => {
  const adapter = new OpenAIAdapter({ apiKey: "sk-test", providerLabel: "OpenAI" });

  const chunks = await withMockedFetch(
    async () =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
      ]),
    async () => {
      const collected: string[] = [];
      for await (const chunk of adapter.streamReply("gpt-4o-mini", [{ role: "user", content: "hi" }])) {
        collected.push(chunk);
      }
      return collected;
    },
  );

  assert.deepEqual(chunks, ["Hel", "lo"]);
});

test("AnthropicAdapter separates system messages and merges consecutive same-role turns", async () => {
  let capturedBody: { system?: string; messages?: Array<{ role: string; content: unknown }> } = {};
  const adapter = new AnthropicAdapter({ apiKey: "test-key" });

  await withMockedFetch(
    async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
    },
    () =>
      adapter.generateReply("claude-sonnet-4-5", [
        { role: "system", content: "be terse" },
        { role: "user", content: "part one" },
        { role: "user", content: "part two" },
      ]),
  );

  assert.equal(capturedBody.system, "be terse");
  assert.equal(capturedBody.messages?.length, 1);
  assert.equal(capturedBody.messages?.[0]?.role, "user");
  assert.deepEqual(capturedBody.messages?.[0]?.content, [{ type: "text", text: "part one\n\npart two" }]);
});

test("AnthropicAdapter builds base64 image blocks for image parts", async () => {
  let capturedBody: { messages?: Array<{ content: Array<{ type: string }> }> } = {};
  const adapter = new AnthropicAdapter({ apiKey: "test-key" });

  await withMockedFetch(
    async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }] }), { status: 200 });
    },
    () =>
      adapter.generateReply("claude-sonnet-4-5", [
        {
          role: "user",
          content: [
            { type: "text", text: "what is this?" },
            { type: "image", mime_type: "image/png", data: "AAAA" },
          ],
        },
      ]),
  );

  const blocks = capturedBody.messages?.[0]?.content ?? [];
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0]?.type, "text");
  assert.equal(blocks[1]?.type, "image");
});

test("OllamaAdapter.generateReply posts messages and returns message.content", async () => {
  const adapter = new OllamaAdapter("http://localhost:11434");

  const reply = await withMockedFetch(
    async () => new Response(JSON.stringify({ message: { content: "local reply" } }), { status: 200 }),
    () => adapter.generateReply("llama3.1", [{ role: "user", content: "hi" }]),
  );

  assert.equal(reply, "local reply");
});

test("OllamaAdapter.streamReply parses newline-delimited JSON chunks (not SSE framing)", async () => {
  const adapter = new OllamaAdapter("http://localhost:11434");
  const ndjson = [JSON.stringify({ message: { content: "Hel" } }), JSON.stringify({ message: { content: "lo" } }), JSON.stringify({ done: true })].join("\n");

  const chunks = await withMockedFetch(
    async () => new Response(ndjson, { status: 200 }),
    async () => {
      const collected: string[] = [];
      for await (const chunk of adapter.streamReply("llama3.1", [{ role: "user", content: "hi" }])) {
        collected.push(chunk);
      }
      return collected;
    },
  );

  assert.deepEqual(chunks, ["Hel", "lo"]);
});
