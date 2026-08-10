import { badGateway } from "../../errors.js";
import { extractStreamErrorDetail } from "../sse.js";
import { mergeConsecutiveMessages, textFromContent, type ChatMessage, type MessageContent, type ProviderAdapter } from "../types.js";

export class OllamaAdapter implements ProviderAdapter {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async generateReply(modelKey: string, messages: ChatMessage[]): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelKey, messages: this.buildMessages(messages), stream: false }),
      });
    } catch {
      throw badGateway("Could not reach Ollama endpoint.");
    }
    if (!response.ok) {
      throw badGateway(await extractStreamErrorDetail(response, "Ollama request failed."));
    }
    const payload = (await response.json()) as { message?: { content?: string } };
    return payload.message?.content ?? "";
  }

  async *streamReply(modelKey: string, messages: ChatMessage[]): AsyncIterable<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelKey, messages: this.buildMessages(messages), stream: true }),
      });
    } catch {
      throw badGateway("Could not reach Ollama endpoint.");
    }
    if (!response.ok || !response.body) {
      throw badGateway(await extractStreamErrorDetail(response, "Ollama streaming request failed."));
    }

    // Ollama's streaming format is newline-delimited JSON (not SSE `data:` framing).
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const content = this.parseChunkContent(line);
          if (content) yield content;
        }
      }
      const trailing = buffer.trim();
      if (trailing) {
        const content = this.parseChunkContent(trailing);
        if (content) yield content;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseChunkContent(line: string): string | null {
    try {
      const event = JSON.parse(line) as { message?: { content?: unknown } };
      const content = event.message?.content;
      return typeof content === "string" && content ? content : null;
    } catch {
      return null;
    }
  }

  private buildMessages(messages: ChatMessage[]): Array<{ role: string; content: string; images?: string[] }> {
    return mergeConsecutiveMessages(messages).map((message) => {
      const content: MessageContent = message.content;
      const built: { role: string; content: string; images?: string[] } = {
        role: message.role,
        content: textFromContent(content),
      };
      if (Array.isArray(content)) {
        const images = content
          .filter((part): part is { type: "image"; mime_type: string; data: string } => part.type === "image" && Boolean(part.data))
          .map((part) => part.data);
        if (images.length > 0) built.images = images;
      }
      return built;
    });
  }
}
