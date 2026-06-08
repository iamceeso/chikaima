import assert from "node:assert/strict";
import test from "node:test";

import { useChatStore } from "../store/chat-store.js";

test("openFreshChat clears the active conversation and marks the next view as fresh", () => {
  useChatStore.setState({
    activeConversationId: "conversation-1",
    startFresh: false,
  });

  useChatStore.getState().openFreshChat();

  assert.equal(useChatStore.getState().activeConversationId, null);
  assert.equal(useChatStore.getState().startFresh, true);
});

test("setActiveConversationId selects a conversation and clears the fresh-chat flag", () => {
  useChatStore.setState({
    activeConversationId: null,
    startFresh: true,
  });

  useChatStore.getState().setActiveConversationId("conversation-2");

  assert.equal(useChatStore.getState().activeConversationId, "conversation-2");
  assert.equal(useChatStore.getState().startFresh, false);
});
