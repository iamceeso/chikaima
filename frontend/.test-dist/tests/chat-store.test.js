"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const chat_store_js_1 = require("../store/chat-store.js");
(0, node_test_1.default)("openFreshChat clears the active conversation and marks the next view as fresh", () => {
    chat_store_js_1.useChatStore.setState({
        activeConversationId: "conversation-1",
        startFresh: false,
    });
    chat_store_js_1.useChatStore.getState().openFreshChat();
    strict_1.default.equal(chat_store_js_1.useChatStore.getState().activeConversationId, null);
    strict_1.default.equal(chat_store_js_1.useChatStore.getState().startFresh, true);
});
(0, node_test_1.default)("setActiveConversationId selects a conversation and clears the fresh-chat flag", () => {
    chat_store_js_1.useChatStore.setState({
        activeConversationId: null,
        startFresh: true,
    });
    chat_store_js_1.useChatStore.getState().setActiveConversationId("conversation-2");
    strict_1.default.equal(chat_store_js_1.useChatStore.getState().activeConversationId, "conversation-2");
    strict_1.default.equal(chat_store_js_1.useChatStore.getState().startFresh, false);
});
