"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MessageItem } from "./message-item";
import { ChatInput } from "./chat-input";
import { FilePanel } from "./file-panel";
import { SuggestedMessages, useSuggestedMessages } from "./suggested-messages";
import type { Conversation, Message, DocumentAsset } from "@/types";
import type { AttachedFile } from "@/hooks/useFileAttachments";
import { cn } from "@/lib/utils";

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

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-foreground-muted mb-2">Select or create a conversation to start</p>
        </div>
      </div>
    );
  }

  const suggestions = useSuggestedMessages(conversation.metadata?.content_type as string);
  const emptyChat = messages.length === 0;

  return (
    <div className="flex-1 flex flex-col bg-background relative">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">{conversation.title}</h2>
        {conversation.model_id && (
          <p className="text-sm text-foreground-muted mt-1">Model: {conversation.model_id}</p>
        )}
      </div>

      {/* Main content container */}
      <div className="flex-1 flex relative">
        {/* Messages area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            {emptyChat && showSuggestions ? (
              <div className="flex items-center justify-center h-full">
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
          <ChatInput
            onSend={onSendMessage}
            onFileUpload={onFileUpload}
            attachedFiles={attachedFiles}
            onRemoveFile={onRemoveAttachedFile}
            isLoading={isLoading}
            placeholder="Ask anything..."
          />
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
