"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Copy,
  FileImage,
  FileText,
  Paperclip,
  PencilLine,
  Sparkles,
  User2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (conversation?.model_id) {
      setSelectedModelId(conversation.model_id);
      return;
    }
    if (!selectedModelId && defaultModel?.id) {
      setSelectedModelId(defaultModel.id);
    }
  }, [conversation?.model_id, defaultModel?.id, selectedModelId]);

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
    mutationFn: async () => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      const content = draft.trim() || "Analyze the attached files.";
      return api.createConversation(token, {
        title: content.slice(0, 48) || "New analysis",
        initial_message: content,
        model_id: activeModel?.id,
        initial_metadata: pendingAttachments.length
          ? {
              attachments: pendingAttachments,
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
    mutationFn: async () => {
      if (!token || !conversation) {
        throw new Error("Create a conversation first.");
      }
      const content = draft.trim() || "Analyze the attached files.";
      return api.sendMessage(token, conversation.id, {
        role: "user",
        content,
        metadata: pendingAttachments.length ? { attachments: pendingAttachments } : undefined,
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

  const onSubmit = () => {
    if (!draft.trim() && !pendingAttachments.length) {
      return;
    }
    if (!conversation) {
      createConversation.mutate();
      return;
    }
    sendMessage.mutate();
  };

  const busy = createConversation.isPending || sendMessage.isPending;

  const handleFiles = async (files: FileList | File[]) => {
    const queue = Array.from(files);
    for (const file of queue) {
      await uploadAttachment.mutateAsync(file);
    }
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        isDragging ? "bg-primary/5" : "",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
    >
      {modelsQuery.data?.length ? null : (
        <div className="border-b border-border bg-background/90 px-4 py-2 text-center text-xs text-foreground-muted sm:px-5">
          No synced models yet. Save or refresh a provider to load available models.
        </div>
      )}
      <div className="border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[13px] font-medium text-foreground">
              {conversation?.title ?? "New chat"}
            </h1>
            <p className="mt-0.5 text-[11px] text-foreground-muted">
              {conversation?.messages?.length
                ? `${conversation.messages.length} messages`
                : "Start an analysis conversation"}
            </p>
          </div>
          <select
            value={activeModel?.id ?? ""}
            disabled={!canSelectModel || !modelsQuery.data?.length}
            onChange={(event) => setSelectedModelId(event.target.value)}
            className={cn(
              "max-w-44 shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground outline-none transition-colors",
              canSelectModel ? "cursor-pointer hover:bg-surface-raised" : "cursor-default opacity-80",
            )}
          >
            {modelsQuery.data?.map((model) => (
              <option key={model.id} value={model.id}>
                {model.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversation?.messages?.length ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
            {conversation.messages.map((message) => {
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
          <div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-5">
            <div className="w-full max-w-3xl">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-center text-2xl font-semibold tracking-tight text-foreground">
                What do you want to understand?
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-center text-[13px] text-foreground-muted">
                Ask about transcripts, summarize a meeting, extract actions, or compare media insights.
              </p>
              <div className="mx-auto mt-6 grid max-w-3xl gap-2.5 sm:grid-cols-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-2xl border border-border bg-surface px-3.5 py-3 text-left text-[13px] text-foreground transition-colors hover:bg-surface-raised"
                  >
                    <span className="font-medium">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[1.2rem] border border-border bg-surface px-3.5 py-3 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none sm:px-4 sm:py-3.5">
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
            {pendingAttachments.length ? (
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
                        onClick={() =>
                          setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))
                        }
                        className="text-muted hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Olanma about your content"
              className="min-h-12 border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus:ring-0 sm:min-h-14"
            />
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-border pt-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-1 text-[11px] text-foreground-muted transition-colors hover:bg-surface-raised"
                >
                  <Paperclip className="h-3 w-3" />
                  Attach
                </button>
                <select
                  value={activeModel?.id ?? ""}
                  disabled={!canSelectModel || !modelsQuery.data?.length}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                  className={cn(
                    "max-w-44 rounded-full border border-border bg-background-secondary px-2.5 py-1 text-[11px] font-medium text-foreground outline-none",
                    canSelectModel ? "cursor-pointer" : "cursor-default opacity-80",
                  )}
                >
                  {modelsQuery.data?.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.display_name}
                    </option>
                  ))}
                </select>
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
