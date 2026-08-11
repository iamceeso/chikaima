import { badGateway } from "../../errors.js";
import { extractStreamErrorDetail, iterSseJsonEvents } from "../sse.js";
import { extractSystemPrompt, mergeConsecutiveMessages, textFromContent, type ChatMessage, type MessageContent, type ProviderAdapter } from "../types.js";

export class GeminiAdapter implements ProviderAdapter {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; baseUrl?: string | null }) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");
  }

  async generateReply(modelKey: string, messages: ChatMessage[]): Promise<string> {
    const payload = this.buildPayload(messages);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/models/${modelKey}:generateContent?key=${encodeURIComponent(this.apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw badGateway("Could not reach the Gemini provider.");
    }
    if (!response.ok) {
      throw badGateway(await extractStreamErrorDetail(response, "Gemini request failed."));
    }
    return this.extractGeminiText((await response.json()) as Record<string, unknown>);
  }

  async *streamReply(modelKey: string, messages: ChatMessage[]): AsyncIterable<string> {
    const payload = this.buildPayload(messages);
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/models/${modelKey}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
    } catch {
      throw badGateway("Could not reach the Gemini provider.");
    }
    if (!response.ok || !response.body) {
      throw badGateway(await extractStreamErrorDetail(response, "Gemini streaming request failed."));
    }

    for await (const event of iterSseJsonEvents(response.body)) {
      const text = this.extractGeminiText(event);
      if (text) yield text;
    }
  }

  private buildPayload(messages: ChatMessage[]): Record<string, unknown> {
    const { systemPrompt, conversationMessages } = extractSystemPrompt(mergeConsecutiveMessages(messages));
    const contents = conversationMessages.map((message) => {
      const role = message.role === "assistant" ? "model" : "user";
      const parts = this.buildParts(message.content);
      return { role, parts: parts.length > 0 ? parts : [{ text: textFromContent(message.content) }] };
    });

    const payload: Record<string, unknown> = { contents };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    return payload;
  }

  private buildParts(content: MessageContent): Array<Record<string, unknown>> {
    if (!Array.isArray(content)) {
      return [{ text: textFromContent(content) }];
    }
    const parts: Array<Record<string, unknown>> = [];
    for (const part of content) {
      if (part.type === "text" && part.text?.trim()) {
        parts.push({ text: part.text.trim() });
      } else if (part.type === "image" && part.mime_type && part.data) {
        parts.push({ inline_data: { mime_type: part.mime_type, data: part.data } });
      }
    }
    return parts;
  }

  private extractGeminiText(payload: Record<string, unknown>): string {
    const candidates = (payload.candidates as Array<Record<string, unknown>> | undefined) ?? [];
    if (candidates.length === 0) return "";
    const content = (candidates[0]?.content as Record<string, unknown> | undefined) ?? {};
    const parts = (content.parts as Array<Record<string, unknown>> | undefined) ?? [];
    return parts
      .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
}
