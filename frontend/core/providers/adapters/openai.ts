import { badGateway } from "../../errors.js";
import { extractStreamErrorDetail, iterSseJsonEvents } from "../sse.js";
import { normalizeMessages, type ChatMessage, type ProviderAdapter } from "../types.js";

interface OpenAIBuiltPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export class OpenAIAdapter implements ProviderAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly providerLabel: string;

  constructor(options: { apiKey: string; baseUrl?: string | null; providerLabel?: string }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    this.providerLabel = options.providerLabel || "OpenAI";
  }

  async generateReply(modelKey: string, messages: ChatMessage[]): Promise<string> {
    const response = await this.post({ model: modelKey, messages: this.buildMessages(messages) });
    if (!response.ok) {
      throw await this.httpError(response, `${this.providerLabel} request failed for model ${modelKey}.`);
    }
    return this.extractContent((await response.json()) as Record<string, unknown>);
  }

  async *streamReply(modelKey: string, messages: ChatMessage[]): AsyncIterable<string> {
    const response = await this.post({ model: modelKey, messages: this.buildMessages(messages), stream: true });
    if (!response.ok || !response.body) {
      throw await this.httpError(response, `${this.providerLabel} streaming request failed for model ${modelKey}.`);
    }

    for await (const event of iterSseJsonEvents(response.body)) {
      const choices = (event.choices as Array<Record<string, unknown>> | undefined) ?? [];
      const delta = (choices[0]?.delta as Record<string, unknown> | undefined) ?? {};
      const content = delta.content;
      if (typeof content === "string" && content) {
        yield content;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === "object" && (part as Record<string, unknown>).type === "text_delta" && (part as Record<string, unknown>).text) {
            yield String((part as Record<string, unknown>).text);
          }
        }
      }
    }
  }

  private async post(payload: Record<string, unknown>): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw badGateway(`Could not reach ${this.providerLabel}.`);
    }
  }

  private async httpError(response: Response, fallback: string): Promise<Error> {
    const detail = await extractStreamErrorDetail(response, fallback);
    return badGateway(detail);
  }

  private extractContent(payload: Record<string, unknown>): string {
    const choice = ((payload.choices as Array<Record<string, unknown>> | undefined) ?? [{}])[0] ?? {};
    const message = (choice.message as Record<string, unknown> | undefined) ?? {};
    const content = message.content;

    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { type: string; text: string } => part && typeof part === "object" && part.type === "text")
        .map((part) => String(part.text ?? "").trim())
        .filter(Boolean)
        .join("\n")
        .trim();
    }
    return "";
  }

  private buildMessages(messages: ChatMessage[]): Array<{ role: string; content: string | OpenAIBuiltPart[] }> {
    return normalizeMessages(messages).map((message) => {
      const content = message.content;
      if (Array.isArray(content)) {
        const parts: OpenAIBuiltPart[] = content
          .filter(
            (part) =>
              (part.type === "text" && part.text?.trim()) || (part.type === "image" && part.mime_type && part.data),
          )
          .map((part) =>
            part.type === "text"
              ? { type: "text", text: part.text.trim() }
              : { type: "image_url", image_url: { url: `data:${part.mime_type};base64,${part.data}` } },
          );
        return { role: message.role, content: parts };
      }
      return { role: message.role, content };
    });
  }
}
