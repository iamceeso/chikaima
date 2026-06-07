"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MessageItem } from "./message-item";
import { ChatInput } from "./chat-input";
import { FilePanel } from "./file-panel";
import { SuggestedMessages, useSuggestedMessages } from "./suggested-messages";
import type { Conversation, Message, DocumentAsset } from "@/types";
import type { AttachedFile } from "@/hooks/useFileAttachments";
interface ChatViewProps {
  conversation: Conversation | null;
  messages: Message[];
  attachedFiles?: AttachedFile[];
  conversationFiles?: DocumentAsset[];
  isLoading?: boolean;
  onSendMessage: (message: string) => Promise<void>;
  onUpdateMessage?: (messageId: string, content: string) => Promise<void>;
  onRegenerateMessage?: (messageId: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  onRemoveAttachedFile?: (fileId: string) => void;
  onRemoveConversationFile?: (fileId: string) => Promise<void>;
  showSuggestions?: boolean;
}

export function ChatView({
  conversation,
  messages,
  attachedFiles = [],
  conversationFiles = [],
  isLoading = false,
  onSendMessage,
  onUpdateMessage,
  onRegenerateMessage,
  onFileUpload,
  onRemoveAttachedFile,
  onRemoveConversationFile,
  showSuggestions = true,
}: ChatViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isFilePanelOpen, setIsFilePanelOpen] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const contentType =
    conversation && "metadata" in conversation
      ? ((conversation as { metadata?: { content_type?: string } }).metadata?.content_type ?? "")
      : "";
  const suggestions = useSuggestedMessages(contentType);
  const emptyChat = messages.length === 0;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">
          {conversation?.title ?? "New conversation"}
        </h2>
        {conversation?.model_id && (
          <p className="text-sm text-foreground-muted mt-1">Model: {conversation.model_id}</p>
        )}
      </div>

      {/* Main content container */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Messages */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {emptyChat && showSuggestions ? (
              <div className="flex min-h-full items-center justify-center">
                <div className="max-w-md text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Start a conversation</h3>
                  <p className="text-sm text-foreground-muted mb-6">
                    Ask questions, analyze content, or chat with the AI assistant.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    isLoading={isLoading}
                    onUpdate={
                      onUpdateMessage
                        ? (content) => onUpdateMessage(message.id, content)
                        : undefined
                    }
                    onRegenerate={
                      onRegenerateMessage
                        ? () => onRegenerateMessage(message.id)
                        : undefined
                    }
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3 py-4 px-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-foreground-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Suggested messages */}
          {emptyChat && showSuggestions && (
            <SuggestedMessages
              suggestions={suggestions.slice(0, 4)}
              onSelect={onSendMessage}
              isLoading={isLoading}
            />
          )}

          {/* Input */}
          <div className="shrink-0">
            <ChatInput
              onSend={onSendMessage}
              onFileUpload={onFileUpload}
              attachedFiles={attachedFiles}
              onRemoveFile={onRemoveAttachedFile}
              isLoading={isLoading}
              placeholder="Ask anything..."
            />
          </div>
        </div>

        {/* File panel */}
        {conversationFiles.length > 0 && (
          <FilePanel
            files={conversationFiles}
            isOpen={isFilePanelOpen}
            onToggle={() => setIsFilePanelOpen(!isFilePanelOpen)}
            onRemove={onRemoveConversationFile}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
}
