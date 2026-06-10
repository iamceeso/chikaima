"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Copy,
  Eye,
  FileImage,
  FileText,
  Inbox,
  Paperclip,
  PencilLine,
  Sparkles,
  User2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { AssetPreviewDialog } from "@/components/assets/asset-preview-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { AssetResourceType, Message } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";
import { RAGReferences } from "./rag-references";

const starterPrompts = [
  "Summarize the latest transcript",
  "Extract action items from this meeting",
  "Compare the top insights across uploads",
  "Draft follow-up notes for the team",
];

const quickActions = [
  { label: "Upload files", kind: "upload" as const },
  { label: "Meeting recap", kind: "prompt" as const, prompt: "Summarize this meeting and list action items." },
  { label: "Compare insights", kind: "prompt" as const, prompt: "Compare the main insights across my latest uploads." },
];

type PendingAttachment = {
  id: string;
  name: string;
  kind: "document" | "audio" | "video";
};

function classifyFile(file: File): PendingAttachment["kind"] | null {
  if (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "text/plain" ||
    file.type === "text/markdown"
  ) {
    return "document";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  return null;
}

function attachmentIcon(kind: PendingAttachment["kind"]) {
  if (kind === "audio") {
    return Volume2;
  }
  if (kind === "video") {
    return Video;
  }
  if (kind === "document") {
    return FileText;
  }
  return FileImage;
}

export function ChatLayout() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const startFresh = useChatStore((state) => state.startFresh);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Record<string, string>>({});
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasReceivedStreamToken, setHasReceivedStreamToken] = useState(false);
  const [branchResetFromMessageId, setBranchResetFromMessageId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    id: string;
    name: string;
    kind: AssetResourceType;
  } | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getConversations(token);
    },
  });

  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getModels(token);
    },
    staleTime: 5 * 60_000,
  });

  const conversation = startFresh
    ? undefined
    : conversationsQuery.data?.find((item) => item.id === activeConversationId);
  const defaultModel = modelsQuery.data?.find((model) => model.is_default) ?? modelsQuery.data?.[0];
  const modelSelectionScope = conversation?.id ?? "fresh";
  const selectedModelId = selectedModelIds[modelSelectionScope] ?? null;
  const activeModel =
    modelsQuery.data?.find((model) => model.id === selectedModelId) ??
    modelsQuery.data?.find((model) => model.id === conversation?.model_id) ??
    defaultModel;
  const displayMessages = [...(conversation?.messages ?? []), ...streamingMessages];
  const visibleMessages = (() => {
    if (!branchResetFromMessageId) {
      return displayMessages;
    }
    const cutoffIndex = displayMessages.findIndex((message) => message.id === branchResetFromMessageId);
    if (cutoffIndex === -1) {
      return displayMessages;
    }
    return displayMessages.slice(0, cutoffIndex + 1);
  })();
  const hasConversation = Boolean(displayMessages.length);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 96)}px`;
  }, [draft, hasConversation]);

  useEffect(() => {
    const textarea = editingTextareaRef.current;
    if (!textarea || !editingMessageId) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 192)}px`;
  }, [editingDraft, editingMessageId]);

  useEffect(() => {
    const historyEl = historyRef.current;
    const composerEl = composerRef.current;
    if (!historyEl || !composerEl) {
      return;
    }

    const applyPadding = () => {
      historyEl.style.paddingBottom = `${composerEl.offsetHeight + 40}px`;
    };

    applyPadding();
    const observer = new ResizeObserver(applyPadding);
    observer.observe(composerEl);
    return () => observer.disconnect();
  }, [hasConversation, pendingAttachments.length, draft]);

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      const kind = classifyFile(file);
      if (!kind) {
        throw new Error(`${file.name} is not supported yet.`);
      }

      if (kind === "document") {
        const uploaded = await api.uploadDocument(token, file);
        return { id: uploaded.id, name: uploaded.name, kind } satisfies PendingAttachment;
      }
      if (kind === "audio") {
        const uploaded = await api.uploadAudio(token, file);
        return { id: uploaded.id, name: uploaded.name, kind } satisfies PendingAttachment;
      }
      const uploaded = await api.uploadVideo(token, file);
      return { id: uploaded.id, name: uploaded.name, kind } satisfies PendingAttachment;
    },
    onSuccess: (uploaded) => {
      setPendingAttachments((current) => [...current, uploaded]);
    },
  });

  const createConversation = useMutation({
    mutationFn: async (override?: { content?: string; attachments?: PendingAttachment[] }) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      const attachments = override?.attachments ?? pendingAttachments;
      const content = override?.content?.trim() || draft.trim() || "Analyze the attached files.";
      return api.createConversation(token, {
        title: content.slice(0, 48) || "New analysis",
        initial_message: content,
        model_id: activeModel?.id,
        initial_metadata: attachments.length
          ? {
              attachments,
            }
          : undefined,
      });
    },
    onSuccess: async (created) => {
      setDraft("");
      setPendingAttachments([]);
      setActiveConversationId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (override?: { content?: string; attachments?: PendingAttachment[] }) => {
      if (!token || !conversation) {
        throw new Error("Create a conversation first.");
      }
      const attachments = override?.attachments ?? pendingAttachments;
      const content = override?.content?.trim() || draft.trim() || "Analyze the attached files.";
      return api.sendMessage(token, conversation.id, {
        role: "user",
        content,
        metadata: attachments.length ? { attachments } : undefined,
      });
    },
    onSuccess: async () => {
      setDraft("");
      setPendingAttachments([]);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const editMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.updateMessage(token, messageId, { content: editingDraft });
    },
    onSuccess: async () => {
      setEditingMessageId(null);
      setEditingDraft("");
      await queryClient.refetchQueries({ queryKey: ["conversations"] });
      setBranchResetFromMessageId(null);
    },
  });

  const busy = createConversation.isPending || sendMessage.isPending || isStreaming;

  const buildLocalMessage = (input: {
    id: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown>;
    status?: string;
  }): Message => ({
    id: input.id,
    conversation_id: conversation?.id ?? "streaming",
    role: input.role,
    content: input.content,
    status: input.status ?? "completed",
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const scrollHistoryToBottom = () => {
    const historyEl = historyRef.current;
    if (!historyEl) {
      return;
    }
    requestAnimationFrame(() => {
      historyEl.scrollTo({
        top: historyEl.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const streamConversation = async (contentOverride?: string) => {
    if (!token) {
      setStreamError("Please sign in first.");
      return;
    }

    const attachments = pendingAttachments;
    const content = contentOverride?.trim() || draft.trim() || "Analyze the attached files.";
    const shouldContinueConversation =
      conversation && (!activeModel?.id || activeModel.id === conversation.model_id);
    const nextConversationId = shouldContinueConversation ? conversation.id : undefined;
    const attachmentMetadata = attachments.length ? { attachments } : undefined;
    const userTempId = `temp-user-${crypto.randomUUID()}`;
    const assistantTempId = `temp-assistant-${crypto.randomUUID()}`;

    setStreamError(null);
    setIsStreaming(true);
    setHasReceivedStreamToken(false);
    setDraft("");
    setPendingAttachments([]);
    setStreamingMessages([
      buildLocalMessage({
        id: userTempId,
        role: "user",
        content,
        metadata: attachmentMetadata,
      }),
      buildLocalMessage({
        id: assistantTempId,
        role: "assistant",
        content: "",
        status: "streaming",
      }),
    ]);
    scrollHistoryToBottom();

    try {
      await api.streamChat(
        token,
        {
          content,
          conversation_id: nextConversationId,
          model_id: nextConversationId ? undefined : activeModel?.id,
          title: content.slice(0, 48) || "New analysis",
          metadata: attachmentMetadata,
          use_rag: true,
        },
        {
          onMetadata: (metadata) => {
            const conversationId = metadata.conversation_id;
            if (typeof conversationId === "string") {
              setActiveConversationId(conversationId);
            }
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === assistantTempId
                  ? {
                      ...message,
                      metadata: {
                        ...message.metadata,
                        provider: metadata.provider,
                        model: metadata.model,
                        rag_citations: Array.isArray(metadata.rag_citations) ? metadata.rag_citations : [],
                      },
                    }
                  : message,
              ),
            );
          },
          onToken: (text) => {
            setHasReceivedStreamToken(true);
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === assistantTempId
                  ? {
                      ...message,
                      content: `${message.content}${text}`,
                      updated_at: new Date().toISOString(),
                    }
                  : message,
              ),
            );
            scrollHistoryToBottom();
          },
          onError: (message) => {
            setStreamError(message);
          },
        },
      );
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Streaming request failed.");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setStreamingMessages([]);
      setIsStreaming(false);
      setHasReceivedStreamToken(false);
    }
  };

  const onSubmit = () => {
    if (!draft.trim() && !pendingAttachments.length) {
      return;
    }
    void streamConversation();
  };

  const handleFiles = async (files: FileList | File[]) => {
    const queue = Array.from(files);
    for (const file of queue) {
      await uploadAttachment.mutateAsync(file);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleQuickAction = (action: (typeof quickActions)[number]) => {
    if (action.kind === "upload") {
      openFilePicker();
      return;
    }
    sendSuggestedPrompt(action.prompt);
  };

  const sendSuggestedPrompt = (prompt: string) => {
    void streamConversation(prompt);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, messageId: string) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (editMessage.isPending || !editingDraft.trim()) {
      return;
    }

    setBranchResetFromMessageId(messageId);
    editMessage.mutate(messageId);
  };

  const renderAttachmentChips = () =>
    pendingAttachments.length ? (
      <div className="mb-2.5 flex flex-wrap gap-2">
        {pendingAttachments.map((attachment) => {
          const Icon = attachmentIcon(attachment.kind);
          return (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-[11px] text-foreground-muted"
            >
              <Icon className="h-3 w-3" />
              {attachment.name}
              <button
                type="button"
                onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                className="text-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    ) : null;

  const showDropOverlay = isDragging && !uploadAttachment.isPending;

  const renderModelPicker = (className?: string) => (
    <select
      value={activeModel?.id ?? ""}
      disabled={!modelsQuery.data?.length}
      onChange={(event) =>
        setSelectedModelIds((current) => ({
          ...current,
          [modelSelectionScope]: event.target.value,
        }))
      }
      className={cn(
        "max-w-52 rounded-full border border-border bg-background-secondary/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none backdrop-blur",
        "cursor-pointer hover:bg-surface-raised",
        className,
      )}
    >
      {modelsQuery.data?.map((model) => (
        <option key={model.id} value={model.id}>
          {model.display_name}
        </option>
      ))}
    </select>
  );

  const renderComposer = () => (
    <div
      ref={composerRef}
      className="w-full"
    >
      <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-2.5 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,audio/*,video/*"
          onChange={(event) => {
            if (!event.target.files?.length) {
              return;
            }
            void handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        {renderAttachmentChips()}
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask Olanma about your content"
          className={cn(
            "resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-sm leading-5 shadow-none focus:ring-0",
            "min-h-0 max-h-24",
          )}
        />
        <div className="mt-1.5 flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-1 text-[11px] text-foreground-muted transition-colors hover:bg-surface-raised"
            >
              <Paperclip className="h-3 w-3" />
              Attach
            </button>
            {renderModelPicker("max-w-44 bg-background-secondary")}
          </div>
          <Button
            onClick={onSubmit}
            disabled={busy || (!draft.trim() && !pendingAttachments.length)}
            size="sm"
            className="h-8 w-8 rounded-full px-0"
          >
            {busy ? "..." : <ArrowUp className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background mb-4",
        isDragging ? "bg-primary/5" : "",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(dragDepthRef.current, 1);
        setIsDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
    >
      {showDropOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-dashed border-primary/40 bg-surface/95 px-8 py-12 text-center shadow-[0_18px_60px_rgba(20,32,25,0.08)] dark:shadow-none">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Drop files into this chat</h3>
            <p className="mt-2 text-sm text-foreground-muted">
              Add PDFs, documents, images, audio, or video and Olanma will attach them to this conversation.
            </p>
            <div className="mt-4 inline-flex items-center rounded-full border border-border bg-background-secondary px-3 py-1 text-xs text-foreground-muted">
              Uploads appear directly in the composer when dropped
            </div>
          </div>
        </div>
      ) : null}

      {!modelsQuery.data?.length ? (
        <div className="border-b border-border bg-background/90 px-4 py-2 text-center text-xs text-foreground-muted sm:px-5">
          No synced models yet. Save or refresh a provider to load available models.
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={historyRef} className="h-full min-h-0 overflow-y-auto overscroll-contain">
        {hasConversation ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            {visibleMessages.map((message) => {
              const isUser = message.role === "user";
              const isTransient = message.id.startsWith("temp-") || message.status === "streaming";
              return (
                <article
                  key={message.id}
                  className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}
                >
                  {!isUser ? (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "max-w-[min(100%,42rem)] rounded-[1.2rem] px-3.5 py-2.5 sm:px-4 sm:py-3",
                      isUser
                        ? "bg-surface-strong text-foreground"
                        : "border border-border bg-surface text-foreground shadow-[0_10px_30px_rgba(20,32,25,0.04)] dark:shadow-none",
                    )}
                  >
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
                      <span>{isUser ? "You" : "Olanma"}</span>
                      {message.metadata?.edited ? <PencilLine className="h-2.5 w-2.5" /> : null}
                      {message.metadata?.regenerated_from ? <Sparkles className="h-2.5 w-2.5" /> : null}
                    </div>
                    {editingMessageId === message.id ? (
                      <div className="space-y-2.5">
                        <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-2.5 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none">
                          <Textarea
                            ref={editingTextareaRef}
                            rows={1}
                            value={editingDraft}
                            onChange={(event) => setEditingDraft(event.target.value)}
                            onKeyDown={(event) => handleEditKeyDown(event, message.id)}
                            placeholder="Edit your message..."
                            className={cn(
                              "resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-[13px] leading-6 shadow-none focus:ring-0 sm:text-sm",
                              "min-h-0 max-h-48",
                            )}
                          />
                          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                            <p className="text-[11px] text-foreground-muted">
                              Press Enter to save and Shift + Enter for a new line
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-7 border border-border px-2.5 text-[11px]"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingDraft("");
                                  setBranchResetFromMessageId(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                className="h-7 px-2.5 text-[11px]"
                                onClick={() => {
                                  setBranchResetFromMessageId(message.id);
                                  editMessage.mutate(message.id);
                                }}
                                disabled={editMessage.isPending || !editingDraft.trim()}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.role === "assistant" && message.status === "streaming" && !hasReceivedStreamToken ? (
                          <div className="flex items-center gap-2 text-[13px] text-foreground-muted sm:text-sm">
                            <span>Thinking</span>
                            <span className="inline-flex gap-0.5">
                              <span className="animate-pulse [animation-delay:0ms]">.</span>
                              <span className="animate-pulse [animation-delay:150ms]">.</span>
                              <span className="animate-pulse [animation-delay:300ms]">.</span>
                            </span>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap wrap-break-word text-[13px] leading-6 text-foreground sm:text-sm">
                            {message.content}
                          </p>
                        )}
                        {Array.isArray(message.metadata?.attachments) && message.metadata.attachments.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {(message.metadata.attachments as Array<{ id?: string; name: string; kind: PendingAttachment["kind"] }>).map((attachment) => {
                              const Icon = attachmentIcon(attachment.kind);
                              return (
                                <div
                                  key={`${message.id}-${attachment.name}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-[11px] text-foreground-muted"
                                >
                                  <Icon className="h-3 w-3" />
                                  {attachment.name}
                                  {attachment.id && attachment.kind === "document" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewAttachment({
                                          id: attachment.id!,
                                          name: attachment.name,
                                          kind: "document",
                                        })
                                      }
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition hover:bg-background hover:text-foreground"
                                      title="Preview document"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {!isUser ? <RAGReferences message={message} /> : null}
                        <div className="mt-2.5 flex gap-2">
                          {isUser ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="h-7 border border-border px-2.5 text-[11px]"
                              disabled={isTransient}
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditingDraft(message.content);
                              }}
                            >
                              <PencilLine className="h-3 w-3" />
                              <span className="ml-1.5">Edit</span>
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="h-7 border border-border px-2.5 text-[11px]"
                              disabled={isTransient}
                              onClick={async () => {
                                await navigator.clipboard.writeText(message.content);
                                setCopiedMessageId(message.id);
                                setTimeout(() => setCopiedMessageId(null), 1500);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                              <span className="ml-1.5">{copiedMessageId === message.id ? "Copied" : "Copy"}</span>
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {isUser ? (
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-foreground">
                      <User2 className="h-3.5 w-3.5" />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center px-4 py-5 sm:px-5">
            <div className="w-full max-w-190">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                How can I help?
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-[13px] text-foreground-muted">
                Analyze transcripts, compare uploads, extract action items, and keep everything in one workspace thread.
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    className="rounded-full border border-border bg-background-secondary px-4 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="mx-auto mt-4 max-w-162.5 rounded-2xl border border-border bg-surface">
                {starterPrompts.map((prompt, index) => (
                  <div key={prompt}>
                    {index > 0 ? <div className="border-t border-border" /> : null}
                    <button
                      type="button"
                      onClick={() => sendSuggestedPrompt(prompt)}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-3 z-20 bg-background/88 px-4 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          {renderComposer()}
          {streamError || createConversation.error || sendMessage.error || uploadAttachment.error || editMessage.error ? (
            <p className="mt-3 text-center text-sm text-primary">
              {streamError ?? (createConversation.error ?? sendMessage.error ?? uploadAttachment.error ?? editMessage.error)?.message}
            </p>
          ) : null}
        </div>
      </div>

      {previewAttachment ? (
        <AssetPreviewDialog
          open={Boolean(previewAttachment)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewAttachment(null);
            }
          }}
          resourceType={previewAttachment.kind}
          resourceId={previewAttachment.id}
          name={previewAttachment.name}
        />
      ) : null}
    </div>
  );
}
