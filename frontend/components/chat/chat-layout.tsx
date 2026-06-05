"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  ChevronDown,
  PencilLine,
  Plus,
  Sparkles,
  User2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";

export function ChatLayout() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

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

  const conversation =
    conversationsQuery.data?.find((item) => item.id === activeConversationId) ?? conversationsQuery.data?.[0];

  const createConversation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.createConversation(token, {
        title: draft.slice(0, 40) || "New conversation",
        initial_message: draft,
        model_id: modelsQuery.data?.[0]?.id,
      });
    },
    onSuccess: async (created) => {
      setDraft("");
      setActiveConversationId(created.id);
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!token || !conversation) {
        throw new Error("Create a conversation first.");
      }
      return api.sendMessage(token, conversation.id, { role: "user", content: draft });
    },
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const onSubmit = () => {
    if (!draft.trim()) {
      return;
    }
    if (!conversation) {
      createConversation.mutate();
      return;
    }
    sendMessage.mutate();
  };

  return (
    <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-b border-border bg-background-secondary/50 lg:flex lg:flex-col lg:border-b-0 lg:border-r">
        <div className="border-b border-border px-3 py-3">
          <Button
            size="sm"
            className="w-full justify-start gap-2 rounded-2xl border border-border bg-surface text-foreground hover:bg-surface-raised"
            onClick={() => setActiveConversationId(null)}
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Recent</p>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {conversationsQuery.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveConversationId(item.id)}
              className={`w-full rounded-2xl px-3 py-3 text-left text-sm transition-colors duration-150 ${
                conversation?.id === item.id
                  ? "bg-surface text-foreground"
                  : "text-foreground-muted hover:bg-surface/80 hover:text-foreground"
              }`}
            >
              <p className="truncate font-medium">{item.title}</p>
              <p className="mt-1 truncate text-xs text-muted">
                {item.messages?.at(-1)?.content ?? "No messages yet"}
              </p>
            </button>
          ))}
          {!conversationsQuery.data?.length ? (
            <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-xs text-foreground-muted">
              No chats yet
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col bg-background">
        {conversation?.messages?.length ? (
          <>
            <div className="border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6">
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    <span className="truncate">{conversation?.title}</span>
                    <ChevronDown className="h-4 w-4 text-foreground-muted" />
                  </button>
                  <p className="mt-2 text-xs text-foreground-muted">
                    Model: {modelsQuery.data?.[0]?.display_name ?? "No model selected"}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl">
                {conversation.messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div key={message.id} className="px-4 py-6 sm:px-6 sm:py-7">
                      <div className="mx-auto flex max-w-3xl gap-3 sm:gap-4">
                        <div
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-medium text-sm sm:h-9 sm:w-9 ${
                            isUser
                              ? "bg-surface-strong text-foreground"
                              : "bg-primary/12 text-primary dark:bg-primary/18"
                          }`}
                        >
                          {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground-muted">
                            <span>{isUser ? "You" : "Assistant"}</span>
                            {message.metadata?.edited ? <PencilLine className="h-3 w-3" /> : null}
                            {message.metadata?.regenerated_from ? <Sparkles className="h-3 w-3" /> : null}
                          </div>
                          <div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
                            <p className="whitespace-pre-wrap text-[15px] leading-7 text-foreground">{message.content}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 sm:px-6">
            <div className="w-full max-w-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-2xl font-semibold text-foreground sm:text-3xl">How can Olanma help today?</h3>
              <p className="mx-auto mt-3 max-w-md text-sm text-foreground-muted">
                Ask a question, switch models, and keep the conversation moving.
              </p>
              <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
                {["Summarize PDF", "Compare models", "Search workspace knowledge"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-2xl border border-border bg-surface p-4 text-sm text-foreground transition-colors hover:bg-surface-raised"
                  >
                    <span className="font-medium">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-[1.75rem] border border-border bg-surface p-3 shadow-[0_10px_30px_rgba(20,32,25,0.06)] dark:shadow-none sm:p-4">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Message Olanma"
                className="min-h-16 border-0 bg-transparent px-0 py-0 text-[15px] shadow-none focus:ring-0 sm:min-h-20"
              />
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3 sm:mt-4 sm:gap-3">
                <div className="flex min-w-0 items-center gap-2 text-xs text-foreground-muted">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {modelsQuery.data?.[0]?.display_name ?? "No model"}
                    <ChevronDown className="h-3.5 w-3.5 text-foreground-muted" />
                  </button>
                  <span className="hidden truncate sm:inline">Type a message and press send</span>
                </div>
                <Button
                  onClick={onSubmit}
                  disabled={createConversation.isPending || sendMessage.isPending || !draft.trim()}
                  size="sm"
                  className="h-10 w-10 rounded-full px-0"
                >
                  {createConversation.isPending || sendMessage.isPending ? "..." : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
