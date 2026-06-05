"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bot, PencilLine, Sparkles, User2, Plus } from "lucide-react";
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
    <div className="grid min-h-[calc(100vh-9rem)] gap-0 lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-surface lg:border-b-0 lg:border-r flex flex-col">
        <div className="border-b border-border px-3 py-3">
          <Button
            size="sm"
            className="w-full justify-center gap-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" />
            New chat
          </Button>
        </div>
        <div className="space-y-1 p-2 overflow-y-auto flex-1">
          {conversationsQuery.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveConversationId(item.id)}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 truncate ${
                conversation?.id === item.id
                  ? "bg-background-secondary text-foreground font-medium"
                  : "text-foreground-muted hover:bg-background-secondary hover:text-foreground"
              }`}
            >
              {item.title}
            </button>
          ))}
          {!conversationsQuery.data?.length ? (
            <div className="rounded-lg px-2.5 py-3 text-xs text-foreground-muted">
              No chats yet
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex flex-col bg-background">
        {conversation?.messages?.length ? (
          <>
            <div className="border-b border-border px-6 py-4 bg-surface">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-foreground truncate">{conversation?.title}</h2>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {modelsQuery.data?.[0]?.display_name ?? "No model selected"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl">
                {conversation.messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div
                      key={message.id}
                      className={`px-4 py-4 sm:px-6 sm:py-5 border-b border-border ${
                        isUser ? "bg-background" : "bg-surface"
                      }`}
                    >
                      <div className="flex gap-3 sm:gap-4">
                        <div
                          className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg font-medium text-sm ${
                            isUser
                              ? "bg-primary text-primary-foreground"
                              : "bg-background-secondary text-foreground-muted"
                          }`}
                        >
                          {isUser ? <User2 className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
                            <span>{isUser ? "You" : "Assistant"}</span>
                            {message.metadata?.edited ? <PencilLine className="h-3 w-3" /> : null}
                            {message.metadata?.regenerated_from ? <Sparkles className="h-3 w-3" /> : null}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-4 sm:px-6">
            <div className="w-full max-w-2xl text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Bot className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg sm:text-xl font-semibold text-foreground">Start a conversation</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs sm:text-sm text-foreground-muted">
                Select a model and ask anything. Your chats are automatically saved.
              </p>
              <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                {[
                  "Summarize PDF",
                  "Compare models",
                  "Draft roadmap",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setDraft(prompt)}
                    className="rounded-lg border border-border bg-[var(--surface-raised)] p-2.5 text-xs text-foreground transition-colors hover:bg-[var(--surface-strong)] sm:p-3 sm:text-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-border bg-surface px-4 sm:px-6 py-4">
          <div className="mx-auto max-w-2xl">
            <div className="rounded-lg border border-border bg-[var(--surface-raised)] p-3 shadow-sm sm:p-4">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Message..."
                className="min-h-16 sm:min-h-20 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus:ring-0"
              />
              <div className="mt-3 sm:mt-4 flex items-center justify-between gap-2 sm:gap-3">
                <p className="text-xs text-foreground-muted hidden sm:block">
                  {modelsQuery.data?.[0]?.display_name ?? "No model"}
                </p>
                <Button
                  onClick={onSubmit}
                  disabled={createConversation.isPending || sendMessage.isPending || !draft.trim()}
                  size="sm"
                  className="rounded-lg bg-primary px-3 text-primary-foreground hover:bg-primary-dark sm:px-4"
                >
                  {createConversation.isPending || sendMessage.isPending ? "..." : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="mt-2 sm:mt-3 text-center text-xs text-foreground-muted">
              Always verify outputs
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
