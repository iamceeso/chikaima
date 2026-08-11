import { badGateway } from "../../errors.js";
import { extractStreamErrorDetail, iterSseJsonEvents } from "../sse.js";
import { extractSystemPrompt, mergeConsecutiveMessages, textFromContent, type ChatMessage, type MessageContent, type ProviderAdapter } from "../types.js";

interface AnthropicBlock {
  type: "text" | "image";
  text?: string;
  source?: { type: "base64"; media_type: string; data: string };
}

export class AnthropicAdapter implements ProviderAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string | null }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  }

  async generateReply(modelKey: string, messages: ChatMessage[]): Promise<string> {
    const response = await this.post(modelKey, messages, false);
    if (!response.ok) {
      throw badGateway(await extractStreamErrorDetail(response, "Anthropic request failed."));
    }
    const payload = (await response.json()) as { content?: Array<Record<string, unknown>> };
    const content = payload.content ?? [];
    return content
      .filter((block) => block && block.type === "text")
      .map((block) => String(block.text ?? "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  async *streamReply(modelKey: string, messages: ChatMessage[]): AsyncIterable<string> {
    const response = await this.post(modelKey, messages, true);
    if (!response.ok || !response.body) {
      throw badGateway(await extractStreamErrorDetail(response, "Anthropic streaming request failed."));
    }

    for await (const event of iterSseJsonEvents(response.body)) {
      if (event.type !== "content_block_delta") continue;
      const delta = (event.delta as Record<string, unknown> | undefined) ?? {};
      const text = delta.text;
      if (typeof text === "string" && text) {
        yield text;
      }
    }
  }

  private async post(modelKey: string, messages: ChatMessage[], stream: boolean): Promise<Response> {
    const { systemPrompt, conversationMessages } = extractSystemPrompt(mergeConsecutiveMessages(messages));
    const payload: Record<string, unknown> = {
      model: modelKey,
      max_tokens: 1024,
      messages: conversationMessages.map((message) => ({
        role: message.role,
        content: this.buildContentBlocks(message.content),
      })),
    };
    if (systemPrompt) payload.system = systemPrompt;
    if (stream) payload.stream = true;

    try {
      return await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw badGateway("Could not reach the Anthropic provider.");
    }
  }

  private buildContentBlocks(content: MessageContent): AnthropicBlock[] {
    if (Array.isArray(content)) {
      const blocks: AnthropicBlock[] = [];
      for (const part of content) {
        if (part.type === "text" && part.text?.trim()) {
          blocks.push({ type: "text", text: part.text.trim() });
        } else if (part.type === "image" && part.mime_type && part.data) {
          blocks.push({ type: "image", source: { type: "base64", media_type: part.mime_type, data: part.data } });
        }
      }
      return blocks.length > 0 ? blocks : [{ type: "text", text: textFromContent(content) }];
    }
    return [{ type: "text", text: textFromContent(content) }];
  }
}
