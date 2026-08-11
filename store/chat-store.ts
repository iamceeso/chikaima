import { create } from "zustand";

interface ChatState {
  activeConversationId: string | null;
  startFresh: boolean;
  setActiveConversationId: (conversationId: string | null) => void;
  openFreshChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  activeConversationId: null,
  startFresh: false,
  setActiveConversationId: (activeConversationId) => set({ activeConversationId, startFresh: false }),
  openFreshChat: () => set({ activeConversationId: null, startFresh: true }),
}));
