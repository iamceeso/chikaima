"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useChatStore = void 0;
const zustand_1 = require("zustand");
exports.useChatStore = (0, zustand_1.create)((set) => ({
    activeConversationId: null,
    startFresh: false,
    setActiveConversationId: (activeConversationId) => set({ activeConversationId, startFresh: false }),
    openFreshChat: () => set({ activeConversationId: null, startFresh: true }),
}));
