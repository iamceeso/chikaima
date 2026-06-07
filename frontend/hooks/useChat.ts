import { useCallback, useState } from "react";
import { api } from "@/services/api";
import type { Conversation, Message } from "@/types";

export function useChat(token: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getConversations(token);
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversations");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  const createConversation = useCallback(
    async (title: string, modelId?: string, initialMessage?: string) => {
      if (!token) return;
      try {
        setIsLoading(true);
        setError(null);
        const conversation = await api.createConversation(token, {
          title,
          model_id: modelId,
          initial_message: initialMessage,
        });
        setCurrentConversation(conversation);
        setConversations((prev) => [conversation, ...prev]);
        return conversation;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create conversation";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token],
  );

  const selectConversation = useCallback((conversation: Conversation) => {
    setCurrentConversation(conversation);
    setMessages(conversation.messages || []);
  }, []);

  const addMessage = useCallback(
    async (
      conversationId: string,
      content: string,
      role: string = "user",
      metadata?: Record<string, unknown>,
    ) => {
      if (!token || !currentConversation) return;
      try {
        setIsLoading(true);
        setError(null);

        const message = await api.sendMessage(token, conversationId, {
          role,
          content,
          metadata,
        });

        setMessages((prev) => [...prev, message]);
        return message;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to send message";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token, currentConversation],
  );

  const updateMessage = useCallback(
    async (messageId: string, content: string) => {
      if (!token) return;
      try {
        setError(null);
        const updated = await api.updateMessage(token, messageId, { content });
        setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update message";
        setError(message);
        throw err;
      }
    },
    [token],
  );

  const regenerateMessage = useCallback(
    async (messageId: string) => {
      if (!token) return;
      try {
        setIsLoading(true);
        setError(null);
        const message = await api.regenerateMessage(token, { message_id: messageId });
        setMessages((prev) => [...prev, message as Message]);
        return message;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to regenerate message";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token],
  );

  return {
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
  };
}
