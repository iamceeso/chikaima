"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Bot, PencilLine, Sparkles, User2 } from "lucide-react";
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
    <div className="grid min-h-[calc(100vh-9rem)] gap-0 lg:grid-cols-[300px_1fr]">
      <aside className="border-b border-border bg-[#2f3037] lg:border-b-0 lg:border-r">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-foreground">Conversations</h2>
              <p className="mt-1 text-xs text-zinc-400">Recent threads and folders</p>
            </div>
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              {conversationsQuery.data?.length ?? 0}
            </span>
          </div>
        </div>
        <div className="space-y-2 p-3">
          {conversationsQuery.data?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveConversationId(item.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                conversation?.id === item.id
                  ? "border-white/10 bg-white/10"
                  : "border-transparent bg-transparent hover:border-white/6 hover:bg-white/5"
              }`}
            >
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {item.folder ?? "General"}
              </p>
            </button>
          ))}
          {!conversationsQuery.data?.length ? (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-zinc-400">
              Start a conversation to build your first thread.
            </div>
          ) : null}
        </div>
      </aside>

      <section className="flex min-h-[70vh] flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-medium text-foreground">
              {conversation?.title ?? "Start a conversation"}
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Dynamic model selection is seeded from connected providers.</p>
          </div>
          <div className="rounded-full border border-border bg-[#2a2b32] px-3 py-1.5 text-xs text-zinc-300">
            {modelsQuery.data?.[0]?.display_name ?? "No model connected"}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {conversation?.messages?.length ? (
            <div>
              {conversation.messages.map((message) => {
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    className={`border-b border-border px-5 py-6 ${
                      isUser ? "bg-transparent" : "bg-[#444654]"
                    }`}
                  >
                    <div className="mx-auto flex w-full max-w-4xl gap-4">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                          isUser ? "bg-[#5436da]" : "bg-[#19c37d]"
                        }`}
                      >
                        {isUser ? <User2 className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-400">
                          <span>{isUser ? "You" : "Assistant"}</span>
                          {message.metadata?.edited ? <PencilLine className="h-3.5 w-3.5" /> : null}
                          {message.metadata?.regenerated_from ? <Sparkles className="h-3.5 w-3.5" /> : null}
                        </div>
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{message.content}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 py-10">
              <div className="w-full max-w-3xl text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#19c37d]">
                  <Bot className="h-7 w-7 text-white" />
                </div>
                <h3 className="mt-6 text-3xl font-semibold text-foreground">How can Olanma help today?</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-zinc-400">
                  Add a provider, select a model, and start a conversation. This layout is ready for streaming chat,
                  edited prompts, and regenerated responses.
                </p>
                <div className="mt-8 grid gap-3 text-left md:grid-cols-3">
                  {[
                    "Summarize a PDF and turn it into action items",
                    "Compare OpenAI and Ollama models for a task",
                    "Draft a product plan from recent meeting notes",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setDraft(prompt)}
                      className="rounded-2xl border border-border bg-[#40414f] p-4 text-sm text-zinc-200 transition hover:bg-[#4a4b58]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border bg-[#343541] px-4 py-4">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-[1.75rem] border border-white/10 bg-[#40414f] p-3 shadow-lg shadow-black/10">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Message Olanma"
                className="min-h-20 border-0 bg-transparent px-2 py-2 text-[15px] shadow-none focus:ring-0"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs text-zinc-400">
                  {modelsQuery.data?.[0]?.display_name ?? "Connect a provider to select a model"}
                </p>
                <Button
                  onClick={onSubmit}
                  disabled={createConversation.isPending || sendMessage.isPending || !draft.trim()}
                  className="h-10 rounded-xl px-4"
                >
                  {createConversation.isPending || sendMessage.isPending ? "Sending..." : <ArrowUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-zinc-500">
              Olanma can make mistakes. Verify important outputs, especially when using custom providers.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
