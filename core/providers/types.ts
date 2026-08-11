export type MessageContentPart = { type: "text"; text: string } | { type: "image"; mime_type: string; data: string };

export type MessageContent = string | MessageContentPart[];

export interface ChatMessage {
  role: string;
  content: MessageContent;
}

export interface ProviderAdapter {
  generateReply(modelKey: string, messages: ChatMessage[]): Promise<string>;
  streamReply(modelKey: string, messages: ChatMessage[]): AsyncIterable<string>;
}

export function textFromContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type: "text"; text: string } => part.type === "text" && Boolean(part.text?.trim()))
      .map((part) => part.text.trim())
      .join("\n\n")
      .trim();
  }
  return String(content ?? "");
}

function isEmptyContent(content: MessageContent): boolean {
  if (typeof content === "string") return content.trim().length === 0;
  return content.length === 0;
}

export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  const normalized: ChatMessage[] = [];
  for (const message of messages) {
    if (message.content === undefined || message.content === null) continue;
    if (isEmptyContent(message.content)) continue;
    normalized.push({ role: String(message.role), content: message.content });
  }
  return normalized;
}

export function extractSystemPrompt(messages: ChatMessage[]): { systemPrompt: string | null; conversationMessages: ChatMessage[] } {
  const systemParts: string[] = [];
  const conversationMessages: ChatMessage[] = [];

  for (const message of normalizeMessages(messages)) {
    if (message.role === "system") {
      systemParts.push(textFromContent(message.content));
    } else {
      conversationMessages.push(message);
    }
  }

  const systemPrompt = systemParts.filter(Boolean).join("\n\n").trim();
  return { systemPrompt: systemPrompt || null, conversationMessages };
}

function mergeMessageContent(left: MessageContent, right: MessageContent): MessageContent {
  if (typeof left === "string" && typeof right === "string") {
    return `${left}\n\n${right}`.trim();
  }
  const leftParts: MessageContentPart[] = Array.isArray(left) ? left : [{ type: "text", text: String(left).trim() }];
  const rightParts: MessageContentPart[] = Array.isArray(right) ? right : [{ type: "text", text: String(right).trim() }];
  return [...leftParts, ...rightParts].filter((part) => !(part.type === "text" && !part.text?.trim()));
}

export function mergeConsecutiveMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  for (const message of normalizeMessages(messages)) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) {
      last.content = mergeMessageContent(last.content, message.content);
    } else {
      merged.push({ ...message });
    }
  }
  return merged;
}
