"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth-store";
import { api } from "@/services/api";
import { useChat } from "@/hooks/useChat";
import { useFileAttachments } from "@/hooks/useFileAttachments";
import {
  ConversationList,
  ChatView,
} from "@/components/chat";
import { Loader2 } from "lucide-react";
import type { DocumentAsset } from "@/types";

export default function ChatPage() {
  const tokens = useAuthStore((state) => state.tokens);
  const token = tokens?.access_token;
  const [initialized, setInitialized] = useState(false);
  const [conversationFiles, setConversationFiles] = useState<DocumentAsset[]>([]);

  const {
    conversations,
    currentConversation,
    messages,
    isLoading,
    error,
    loadConversations,
    createConversation,
    selectConversation,
    addMessage,
    updateMessage,
    regenerateMessage,
  } = useChat(token || null);

  const {
    attachedFiles,
    addFile,
    markFileUploaded,
    markFileError,
    clearFiles,
    removeFile,
  } = useFileAttachments();

  // Load conversations on mount
  useEffect(() => {
    if (token) {
      loadConversations().then(() => setInitialized(true));
    }
  }, [token, loadConversations]);

  // Load documents for current conversation
  useEffect(() => {
    async function loadFiles() {
      if (!token || !currentConversation) return;
      try {
        const docs = await api.getDocuments(token);
        setConversationFiles(docs);
      } catch (err) {
        console.error("Failed to load documents:", err);
      }
    }
    loadFiles();
  }, [token, currentConversation]);

  const handleCreateConversation = async () => {
    try {
      const conv = await createConversation(`Conversation ${new Date().toLocaleDateString()}`);
      if (conv) {
        selectConversation(conv);
      }
    } catch (err) {
      console.error("Failed to create conversation:", err);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!currentConversation) return;
    try {
      const attachmentMetadata = attachedFiles.map((file) => ({
        id: file.id,
        name: file.file.name,
        size: file.file.size,
        mime_type: file.file.type,
        uploaded_at: file.uploadedAt ?? null,
        status: file.status ?? "uploading",
        document_id: file.documentId ?? null,
      }));

      await addMessage(
        currentConversation.id,
        content,
        "user",
        attachmentMetadata.length ? { attachments: attachmentMetadata } : undefined,
      );
      clearFiles();
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleUpdateMessage = async (messageId: string, content: string) => {
    try {
      await updateMessage(messageId, content);
    } catch (err) {
      console.error("Failed to update message:", err);
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    try {
      await regenerateMessage(messageId);
    } catch (err) {
      console.error("Failed to regenerate message:", err);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!token) return;
    const fileId = addFile(file);
    try {
      const uploaded = await api.uploadDocument(token, file);
      markFileUploaded(fileId, new Date().toISOString(), uploaded.id);
      // Reload documents
      const docs = await api.getDocuments(token);
      setConversationFiles(docs);
    } catch (err) {
      console.error("Failed to upload file:", err);
      markFileError(fileId);
    }
  };

  const handleRemoveAttachedFile = (fileId: string) => {
    removeFile(fileId);
  };

  const handleRemoveConversationFile = async (fileId: string) => {
    if (!token) return;
    try {
      // Call API to remove document if available
      // For now, just remove from state
      setConversationFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      console.error("Failed to remove file:", err);
    }
  };

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-foreground-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading conversations...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar with conversation list */}
      <div className="w-72 hidden md:flex flex-col border-r border-border">
        <ConversationList
          conversations={conversations}
          currentId={currentConversation?.id}
          isLoading={isLoading}
          onSelect={selectConversation}
          onCreate={handleCreateConversation}
        />
      </div>

      {/* Main chat area */}
      <ChatView
        conversation={currentConversation}
        messages={messages}
        attachedFiles={attachedFiles}
        conversationFiles={conversationFiles}
        isLoading={isLoading}
        onSendMessage={handleSendMessage}
        onUpdateMessage={handleUpdateMessage}
        onRegenerateMessage={handleRegenerateMessage}
        onFileUpload={handleFileUpload}
        onRemoveAttachedFile={handleRemoveAttachedFile}
        onRemoveConversationFile={handleRemoveConversationFile}
      />

      {/* Error display */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive text-destructive-foreground px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
