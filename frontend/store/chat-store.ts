import { create } from "zustand";

interface ChatState {
  activeConversationId: string | null;
  setActiveConversationId: (conversationId: string | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
}));
