/** Splits a fetch response body into text lines, mirroring httpx's `response.iter_lines()`. */
async function* iterLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        yield buffer.slice(0, newlineIndex).replace(/\r$/, "");
        buffer = buffer.slice(newlineIndex + 1);
      }
    }
    if (buffer.length > 0) {
      yield buffer.replace(/\r$/, "");
    }
  } finally {
    reader.releaseLock();
  }
}

/** Parses an SSE (`data: {...}`) stream of JSON events, matching `_iter_sse_json_events` in the Python provider adapters. */
export async function* iterSseJsonEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  let dataLines: string[] = [];

  const emit = function* (): Generator<Record<string, unknown>> {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (payload === "[DONE]") return;
    try {
      yield JSON.parse(payload) as Record<string, unknown>;
    } catch {
      // ignore malformed chunks, matching the Python adapters' `except ValueError: continue`
    }
  };

  for await (const rawLine of iterLines(body)) {
    const line = rawLine.trim();
    if (!line) {
      yield* emit();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  yield* emit();
}

export async function extractStreamErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}
