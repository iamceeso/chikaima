"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Copy,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";

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
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
  });

  const conversation = startFresh
    ? undefined
    : conversationsQuery.data?.find((item) => item.id === activeConversationId) ?? conversationsQuery.data?.[0];
  const defaultModel = modelsQuery.data?.find((model) => model.is_default) ?? modelsQuery.data?.[0];
  const activeModel =
    modelsQuery.data?.find((model) => model.id === conversation?.model_id) ??
    modelsQuery.data?.find((model) => model.id === selectedModelId) ??
    defaultModel;
  const canSelectModel = !conversation;
  const hasConversation = Boolean(conversation?.messages?.length);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft, hasConversation]);

  useEffect(() => {
    const historyEl = historyRef.current;
    const composerEl = composerRef.current;
    if (!historyEl || !composerEl) {
      return;
    }

    const applyPadding = () => {
      historyEl.style.paddingBottom = `${composerEl.offsetHeight + 72}px`;
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
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const busy = createConversation.isPending || sendMessage.isPending;

  const onSubmit = () => {
    if (!draft.trim() && !pendingAttachments.length) {
      return;
    }
    if (!conversation) {
      createConversation.mutate(undefined);
      return;
    }
    sendMessage.mutate(undefined);
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
    if (conversation) {
      sendMessage.mutate({ content: prompt });
      return;
    }
    createConversation.mutate({ content: prompt });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
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
      disabled={!canSelectModel || !modelsQuery.data?.length}
      onChange={(event) => setSelectedModelId(event.target.value)}
      className={cn(
        "max-w-52 rounded-full border border-border bg-background-secondary/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none backdrop-blur",
        canSelectModel ? "cursor-pointer hover:bg-surface-raised" : "cursor-default opacity-80",
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
      <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-3 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none">
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
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask Olanma about your content"
          className={cn(
            "resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus:ring-0",
            "min-h-12 max-h-40 sm:min-h-14",
          )}
        />
        <div className="mt-2 flex items-center justify-between gap-3 pt-1.5">
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
        "relative flex h-full min-h-0 flex-col overflow-hidden bg-background",
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
            {conversation?.messages.map((message) => {
              const isUser = message.role === "user";
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
                        <Textarea
                          value={editingDraft}
                          onChange={(event) => setEditingDraft(event.target.value)}
                          className="min-h-20 border border-border bg-background text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="xs"
                            onClick={() => editMessage.mutate(message.id)}
                            disabled={editMessage.isPending || !editingDraft.trim()}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            className="border border-border"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingDraft("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap text-[13px] leading-6 text-foreground sm:text-sm">
                          {message.content}
                        </p>
                        {Array.isArray(message.metadata?.attachments) && message.metadata.attachments.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {(message.metadata.attachments as Array<{ name: string; kind: PendingAttachment["kind"] }>).map((attachment) => {
                              const Icon = attachmentIcon(attachment.kind);
                              return (
                                <span
                                  key={`${message.id}-${attachment.name}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-[11px] text-foreground-muted"
                                >
                                  <Icon className="h-3 w-3" />
                                  {attachment.name}
                                </span>
                              );
                            })}
                          </div>
                        ) : null}
                        <div className="mt-2.5 flex gap-2">
                          {isUser ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="h-7 border border-border px-2.5 text-[11px]"
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

      <div className="absolute inset-x-0 bottom-0 z-20 bg-background/92 px-4 pb-[max(0.7rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          {renderComposer()}
          {createConversation.error || sendMessage.error || uploadAttachment.error || editMessage.error ? (
            <p className="mt-3 text-center text-sm text-primary">
              {(createConversation.error ?? sendMessage.error ?? uploadAttachment.error ?? editMessage.error)?.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
