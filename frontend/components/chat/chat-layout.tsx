"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Bot,
  Copy,
  Eye,
  FileImage,
  FileText,
  FolderOpen,
  Inbox,
  MessageCircle,
  Mic,
  Paperclip,
  PencilLine,
  Sparkles,
  Square,
  User2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { AssetPreviewDialog } from "@/components/assets/asset-preview-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { AssetResourceType, Message } from "@/types";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";
import { MessageMarkdown } from "./message-markdown";
import { RAGReferences } from "./rag-references";

const starterPrompts = [
  "Summarize the latest transcript",
  "Extract action items from this meeting",
  "Compare the top insights across uploads",
  "Draft follow-up notes for the team",
];

const quickActions = [
  { label: "Upload files", kind: "upload" as const },
  { label: "Add folder", kind: "folder" as const },
  { label: "Meeting recap", kind: "prompt" as const, prompt: "Summarize this meeting and list action items." },
  { label: "Compare insights", kind: "prompt" as const, prompt: "Compare the main insights across my latest uploads." },
];

type PendingAttachment = {
  id: string;
  name: string;
  kind: "document" | "audio" | "video";
};

type DirectoryCapableInput = HTMLInputElement & {
  webkitdirectory?: boolean;
};

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};

type SpeechRecognitionEvent = Event & {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onspeechstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

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

function shouldIgnoreFile(file: File): boolean {
  return file.name === ".DS_Store" || file.name.startsWith("._");
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

function buildSpeechText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " Code example omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " link ")
    .replace(/[#>*_-]{2,}/g, " ")
    .replace(/\b([A-Z])\.(?=[A-Z]\.)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSpeechVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) {
    return null;
  }

  const preferred = voices.find((voice) => voice.lang.startsWith("en") && /Samantha|Daniel|Karen|Moira/i.test(voice.name));
  if (preferred) {
    return preferred;
  }

  const localEnglish = voices.find((voice) => voice.lang.startsWith("en") && voice.localService);
  if (localEnglish) {
    return localEnglish;
  }

  return voices.find((voice) => voice.lang.startsWith("en")) ?? voices[0] ?? null;
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
  const [selectedModelIds, setSelectedModelIds] = useState<Record<string, string>>({});
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingMessages, setStreamingMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasReceivedStreamToken, setHasReceivedStreamToken] = useState(false);
  const [isVoiceSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition),
  );
  const [isSpeechSupported] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.speechSynthesis !== "undefined" &&
      typeof window.SpeechSynthesisUtterance !== "undefined",
  );
  const [isListening, setIsListening] = useState(false);
  const [autoReadAloud, setAutoReadAloud] = useState(false);
  const [conversationMode, setConversationMode] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [branchResetFromMessageId, setBranchResetFromMessageId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    id: string;
    name: string;
    kind: AssetResourceType;
  } | null>(null);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<DirectoryCapableInput | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechInterruptionArmedRef = useRef(false);
  const speechInterruptionTimerRef = useRef<number | null>(null);
  const autoSpokenMessageIdRef = useRef<string | null>(null);
  const seededConversationIdRef = useRef<string | null>(null);
  const queuedVoiceSubmissionRef = useRef<string | null>(null);
  const resumeConversationAfterSpeechRef = useRef(false);

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
    staleTime: 5 * 60_000,
  });

  const conversation = startFresh
    ? undefined
    : conversationsQuery.data?.find((item) => item.id === activeConversationId);
  const defaultModel = modelsQuery.data?.find((model) => model.is_default) ?? modelsQuery.data?.[0];
  const modelSelectionScope = conversation?.id ?? "fresh";
  const selectedModelId = selectedModelIds[modelSelectionScope] ?? null;
  const activeModel =
    modelsQuery.data?.find((model) => model.id === selectedModelId) ??
    modelsQuery.data?.find((model) => model.id === conversation?.model_id) ??
    defaultModel;
  const displayMessages = [...(conversation?.messages ?? []), ...streamingMessages];
  const visibleMessages = (() => {
    if (!branchResetFromMessageId) {
      return displayMessages;
    }
    const cutoffIndex = displayMessages.findIndex((message) => message.id === branchResetFromMessageId);
    if (cutoffIndex === -1) {
      return displayMessages;
    }
    return displayMessages.slice(0, cutoffIndex + 1);
  })();
  const hasConversation = Boolean(displayMessages.length);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 96)}px`;
  }, [draft, hasConversation]);

  useEffect(() => {
    const textarea = editingTextareaRef.current;
    if (!textarea || !editingMessageId) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 28), 192)}px`;
  }, [editingDraft, editingMessageId]);

  useEffect(() => {
    return () => {
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      speechInterruptionArmedRef.current = false;
      speechRecognitionRef.current?.stop();
      speechRecognitionRef.current = null;
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!isSpeechSupported || typeof window === "undefined") {
      return;
    }

    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [isSpeechSupported]);

  useEffect(() => {
    const historyEl = historyRef.current;
    const composerEl = composerRef.current;
    if (!historyEl || !composerEl) {
      return;
    }

    const applyPadding = () => {
      historyEl.style.paddingBottom = `${composerEl.offsetHeight + 40}px`;
    };

    applyPadding();
    const observer = new ResizeObserver(applyPadding);
    observer.observe(composerEl);
    return () => observer.disconnect();
  }, [hasConversation, pendingAttachments.length, draft]);

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
    mutationFn: async (override?: { content?: string; attachments?: PendingAttachment[] }) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      const attachments = override?.attachments ?? pendingAttachments;
      const content = override?.content?.trim() || draft.trim() || "Analyze the attached files.";
      return api.createConversation(token, {
        title: content.slice(0, 48) || "New analysis",
        initial_message: content,
        model_id: activeModel?.id,
        initial_metadata: attachments.length
          ? {
              attachments,
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
    mutationFn: async (override?: { content?: string; attachments?: PendingAttachment[] }) => {
      if (!token || !conversation) {
        throw new Error("Create a conversation first.");
      }
      const attachments = override?.attachments ?? pendingAttachments;
      const content = override?.content?.trim() || draft.trim() || "Analyze the attached files.";
      return api.sendMessage(token, conversation.id, {
        role: "user",
        content,
        metadata: attachments.length ? { attachments } : undefined,
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
      await queryClient.refetchQueries({ queryKey: ["conversations"] });
      setBranchResetFromMessageId(null);
    },
  });

  const busy = createConversation.isPending || sendMessage.isPending || isStreaming;

  const buildLocalMessage = (input: {
    id: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown>;
    status?: string;
  }): Message => ({
    id: input.id,
    conversation_id: conversation?.id ?? "streaming",
    role: input.role,
    content: input.content,
    status: input.status ?? "completed",
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const scrollHistoryToBottom = () => {
    const historyEl = historyRef.current;
    if (!historyEl) {
      return;
    }
    requestAnimationFrame(() => {
      historyEl.scrollTo({
        top: historyEl.scrollHeight,
        behavior: "smooth",
      });
    });
  };

  const interruptAssistantSpeech = (statusMessage: string) => {
    if (typeof window === "undefined" || !speakingMessageId) {
      return false;
    }

    speechInterruptionArmedRef.current = false;
    if (speechInterruptionTimerRef.current) {
      window.clearTimeout(speechInterruptionTimerRef.current);
      speechInterruptionTimerRef.current = null;
    }
    resumeConversationAfterSpeechRef.current = false;
    window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
    setVoiceStatus(statusMessage);
    return true;
  };

  const stopAssistantSpeech = (statusMessage?: string) => {
    if (typeof window === "undefined") {
      return false;
    }

    const wasSpeaking = Boolean(speakingMessageId);
    if (speechInterruptionTimerRef.current) {
      window.clearTimeout(speechInterruptionTimerRef.current);
      speechInterruptionTimerRef.current = null;
    }
    speechInterruptionArmedRef.current = false;
    resumeConversationAfterSpeechRef.current = false;
    window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
    if (statusMessage) {
      setVoiceStatus(statusMessage);
    }
    return wasSpeaking;
  };

  function startVoiceInput(options?: { preserveStatus?: boolean }) {
    if (!isVoiceSupported) {
      setVoiceStatus("Voice input is not supported in this browser.");
      return;
    }

    if (speechRecognitionRef.current) {
      return;
    }

    const interruptedSpeech = stopAssistantSpeech(
      conversationMode ? "Interrupted. Listening to you..." : "Listening...",
    );

    const recognitionConstructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!recognitionConstructor) {
      setVoiceStatus("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new recognitionConstructor();
    speechRecognitionRef.current = recognition;
    recognition.continuous = !conversationMode;
    recognition.interimResults = conversationMode;
    recognition.lang = "en-US";
    recognition.onspeechstart = () => {
      if (!conversationMode) {
        return;
      }
      interruptAssistantSpeech("Interrupted. Listening to you...");
    };
    queuedVoiceSubmissionRef.current = null;
    recognition.onresult = (event) => {
      const results = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => ({
          transcript: result[0]?.transcript?.trim() ?? "",
          isFinal: result.isFinal,
        }))
        .filter((result) => result.transcript);

      const heardSpeech = results.map((result) => result.transcript).join(" ").trim();
      if (conversationMode && heardSpeech) {
        interruptAssistantSpeech("Interrupted. Listening to you...");
      }

      const transcript = results
        .filter((result) => result.isFinal)
        .map((result) => result.transcript)
        .join(" ")
        .trim();

      if (!transcript) {
        return;
      }

      setDraft((current) => `${current.trim()}${current.trim() ? " " : ""}${transcript}`.trim());
      queuedVoiceSubmissionRef.current = `${queuedVoiceSubmissionRef.current?.trim() ?? ""}${queuedVoiceSubmissionRef.current?.trim() ? " " : ""}${transcript}`.trim();
      setVoiceStatus("Voice captured.");
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      speechRecognitionRef.current = null;
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      resumeConversationAfterSpeechRef.current = false;
      setVoiceStatus(
        event.error === "not-allowed"
          ? "Microphone access was blocked."
          : "Voice input could not continue.",
      );
    };
    recognition.onend = () => {
      setIsListening(false);
      speechRecognitionRef.current = null;
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      const transcript = queuedVoiceSubmissionRef.current?.trim() ?? "";
      if (conversationMode && transcript) {
        queuedVoiceSubmissionRef.current = transcript;
        setVoiceStatus("Sending your spoken reply...");
        return;
      }
      if (conversationMode) {
        setVoiceStatus("Conversation mode is waiting for you to speak.");
      }
    };

    if (!options?.preserveStatus || interruptedSpeech) {
      setVoiceStatus(conversationMode ? "Conversation mode is listening..." : "Listening...");
    }
    setIsListening(true);
    recognition.start();
  }

  const ensureVoiceInputForSpeech = useEffectEvent((options?: { preserveStatus?: boolean }) => {
    startVoiceInput(options);
  });

  useEffect(() => {
    const historyEl = historyRef.current;
    if (!historyEl) {
      return;
    }

    requestAnimationFrame(() => {
      historyEl.scrollTop = historyEl.scrollHeight;
    });
  }, [conversation?.id]);

  useEffect(() => {
    if (seededConversationIdRef.current === (conversation?.id ?? null)) {
      return;
    }

    seededConversationIdRef.current = conversation?.id ?? null;
    const latestAssistantMessage = [...(conversation?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim());
    autoSpokenMessageIdRef.current = latestAssistantMessage?.id ?? null;
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }, [conversation?.id, conversation?.messages]);

  useEffect(() => {
    if (!autoReadAloud || !isSpeechSupported || isStreaming) {
      return;
    }

    const latestAssistantMessage = [...visibleMessages]
      .reverse()
      .find(
        (message) =>
          message.role === "assistant" &&
          message.status !== "streaming" &&
          message.content.trim(),
      );

    if (!latestAssistantMessage || latestAssistantMessage.id === autoSpokenMessageIdRef.current) {
      return;
    }

    autoSpokenMessageIdRef.current = latestAssistantMessage.id;
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
    if (conversationMode && !speechRecognitionRef.current) {
      ensureVoiceInputForSpeech({ preserveStatus: true });
    }
    const utterance = new SpeechSynthesisUtterance(buildSpeechText(latestAssistantMessage.content));
    const selectedVoice = pickSpeechVoice(speechVoices);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    speechInterruptionArmedRef.current = true;
    if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(speechInterruptionTimerRef.current);
      speechInterruptionTimerRef.current = null;
    }
    utterance.onend = () => {
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      setSpeakingMessageId((current) => (current === latestAssistantMessage.id ? null : current));
      if (conversationMode && isVoiceSupported) {
        resumeConversationAfterSpeechRef.current = true;
        setVoiceStatus("Conversation mode is listening for your reply.");
      }
    };
    utterance.onerror = () => {
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      setSpeakingMessageId((current) => (current === latestAssistantMessage.id ? null : current));
    };
    setSpeakingMessageId(latestAssistantMessage.id);
    window.speechSynthesis.speak(utterance);
  }, [autoReadAloud, conversationMode, isSpeechSupported, isStreaming, isVoiceSupported, speechVoices, visibleMessages]);

  const streamConversation = async (contentOverride?: string) => {
    if (!token) {
      setStreamError("Please sign in first.");
      return;
    }

    const attachments = pendingAttachments;
    const content = contentOverride?.trim() || draft.trim() || "Analyze the attached files.";
    const nextConversationId = conversation?.id;
    const attachmentMetadata = attachments.length ? { attachments } : undefined;
    const userTempId = `temp-user-${crypto.randomUUID()}`;
    const assistantTempId = `temp-assistant-${crypto.randomUUID()}`;

    setStreamError(null);
    setIsStreaming(true);
    setHasReceivedStreamToken(false);
    setDraft("");
    setPendingAttachments([]);
    setStreamingMessages([
      buildLocalMessage({
        id: userTempId,
        role: "user",
        content,
        metadata: attachmentMetadata,
      }),
      buildLocalMessage({
        id: assistantTempId,
        role: "assistant",
        content: "",
        status: "streaming",
      }),
    ]);
    scrollHistoryToBottom();

    try {
      await api.streamChat(
        token,
        {
          content,
          conversation_id: nextConversationId,
          model_id: activeModel?.id,
          title: content.slice(0, 48) || "New analysis",
          metadata: attachmentMetadata,
          use_rag: true,
        },
        {
          onMetadata: (metadata) => {
            const conversationId = metadata.conversation_id;
            if (typeof conversationId === "string") {
              setActiveConversationId(conversationId);
            }
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === assistantTempId
                  ? {
                      ...message,
                      metadata: {
                        ...message.metadata,
                        provider: metadata.provider,
                        model: metadata.model,
                        rag_citations: Array.isArray(metadata.rag_citations) ? metadata.rag_citations : [],
                      },
                    }
                  : message,
              ),
            );
          },
          onToken: (text) => {
            setHasReceivedStreamToken(true);
            setStreamingMessages((current) =>
              current.map((message) =>
                message.id === assistantTempId
                  ? {
                      ...message,
                      content: `${message.content}${text}`,
                      updated_at: new Date().toISOString(),
                    }
                  : message,
              ),
            );
            scrollHistoryToBottom();
          },
          onError: (message) => {
            setStreamError(message);
          },
        },
      );
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : "Streaming request failed.");
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setStreamingMessages([]);
      setIsStreaming(false);
      setHasReceivedStreamToken(false);
    }
  };

  const onSubmit = () => {
    if (!draft.trim() && !pendingAttachments.length) {
      return;
    }
    stopAssistantSpeech();
    if (isListening) {
      speechRecognitionRef.current?.stop();
    }
    void streamConversation();
  };

  const handleFiles = async (files: FileList | File[]) => {
    const queue = Array.from(files);
    for (const file of queue) {
      if (shouldIgnoreFile(file)) {
        continue;
      }
      await uploadAttachment.mutateAsync(file);
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const openFolderPicker = () => folderInputRef.current?.click();

  const handleQuickAction = (action: (typeof quickActions)[number]) => {
    if (action.kind === "upload") {
      openFilePicker();
      return;
    }
    if (action.kind === "folder") {
      openFolderPicker();
      return;
    }
    sendSuggestedPrompt(action.prompt);
  };

  const sendSuggestedPrompt = (prompt: string) => {
    stopAssistantSpeech();
    void streamConversation(prompt);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  const toggleSpeechPlayback = (messageId: string, text: string) => {
    if (!isSpeechSupported || typeof window === "undefined") {
      setVoiceStatus("Read aloud is not supported in this browser.");
      return;
    }

    if (speakingMessageId === messageId) {
      stopAssistantSpeech("Voice reply stopped.");
      return;
    }

    stopAssistantSpeech();
    if (conversationMode && !speechRecognitionRef.current) {
      startVoiceInput({ preserveStatus: true });
    }
    const utterance = new SpeechSynthesisUtterance(buildSpeechText(text));
    const selectedVoice = pickSpeechVoice(speechVoices);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 0.94;
    utterance.pitch = 1.02;
    utterance.volume = 1;
    speechInterruptionArmedRef.current = true;
    if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(speechInterruptionTimerRef.current);
      speechInterruptionTimerRef.current = null;
    }
    utterance.onend = () => {
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      setSpeakingMessageId((current) => (current === messageId ? null : current));
    };
    utterance.onerror = () => {
      speechInterruptionArmedRef.current = false;
      if (speechInterruptionTimerRef.current && typeof window !== "undefined") {
        window.clearTimeout(speechInterruptionTimerRef.current);
        speechInterruptionTimerRef.current = null;
      }
      setSpeakingMessageId((current) => (current === messageId ? null : current));
    };
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  const submitQueuedVoice = useEffectEvent((transcript: string) => {
    setDraft("");
    void streamConversation(transcript);
  });

  const resumeConversationListening = useEffectEvent(() => {
    startVoiceInput();
  });

  useEffect(() => {
    if (!conversationMode || isListening || isStreaming) {
      return;
    }

    const queuedTranscript = queuedVoiceSubmissionRef.current?.trim();
    if (!queuedTranscript) {
      return;
    }

    queuedVoiceSubmissionRef.current = null;
    submitQueuedVoice(queuedTranscript);
  }, [conversationMode, isListening, isStreaming]);

  useEffect(() => {
    if (
      !conversationMode ||
      !isVoiceSupported ||
      isListening ||
      isStreaming ||
      speakingMessageId ||
      !resumeConversationAfterSpeechRef.current
    ) {
      return;
    }

    resumeConversationAfterSpeechRef.current = false;
    resumeConversationListening();
  }, [conversationMode, isListening, isStreaming, isVoiceSupported, speakingMessageId]);

  const toggleVoiceInput = () => {
    if (isListening) {
      resumeConversationAfterSpeechRef.current = false;
      speechRecognitionRef.current?.stop();
      return;
    }

    startVoiceInput();
  };

  const toggleConversationMode = () => {
    if (!isVoiceSupported || !isSpeechSupported) {
      setVoiceStatus("Conversation mode needs both microphone and read aloud support.");
      return;
    }

    setConversationMode((current) => {
      const next = !current;
      setAutoReadAloud(next);
      if (!next) {
        resumeConversationAfterSpeechRef.current = false;
        queuedVoiceSubmissionRef.current = null;
        if (isListening) {
          speechRecognitionRef.current?.stop();
        }
        if (typeof window !== "undefined") {
          window.speechSynthesis.cancel();
        }
        setSpeakingMessageId(null);
        setVoiceStatus("Conversation mode turned off.");
      } else {
        resumeConversationAfterSpeechRef.current = true;
        setVoiceStatus("Conversation mode is listening...");
      }
      return next;
    });
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, messageId: string) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (editMessage.isPending || !editingDraft.trim()) {
      return;
    }

    setBranchResetFromMessageId(messageId);
    editMessage.mutate(messageId);
  };

  const renderAttachmentChips = () =>
    pendingAttachments.length ? (
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
                onClick={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                className="text-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    ) : null;

  const showDropOverlay = isDragging && !uploadAttachment.isPending;
  const conversationVisualState = isListening
    ? "listening"
    : speakingMessageId
      ? "speaking"
      : isStreaming
        ? "thinking"
        : "idle";

  const renderConversationDialog = () => {
    if (!conversationMode) {
      return null;
    }

    const bars = [18, 28, 20, 34, 22, 30, 18];
    const statusLabel =
      conversationVisualState === "listening"
        ? "Listening for you"
        : conversationVisualState === "speaking"
          ? "Reading the reply"
          : conversationVisualState === "thinking"
            ? "Thinking through the answer"
            : "Ready when you are";

    return (
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-4">
        <div className="pointer-events-auto w-full max-w-sm rounded-[1.75rem] border border-border bg-surface/96 p-5 shadow-[0_24px_90px_rgba(20,32,25,0.16)] backdrop-blur-md dark:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
                Conversation Mode
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">{statusLabel}</h3>
              <p className="mt-2 text-sm text-foreground-muted">
                {voiceStatus ?? "Start talking naturally and Olanma will keep the voice loop going."}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleConversationMode}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground-muted transition hover:bg-surface-raised hover:text-foreground"
              aria-label="Close conversation mode"
              title="Close conversation mode"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-5 flex min-h-28 items-center justify-center rounded-3xl border border-border bg-background/80 px-4">
            <div className="flex items-center gap-1.5">
              {bars.map((height, index) => (
                <span
                  key={`${conversationVisualState}-${height}-${index}`}
                  className={cn(
                    "w-1.5 rounded-full transition-all",
                    conversationVisualState === "listening"
                      ? "bg-emerald-500 animate-pulse"
                      : conversationVisualState === "speaking"
                        ? "bg-primary animate-pulse"
                        : conversationVisualState === "thinking"
                          ? "bg-foreground-muted/70 animate-pulse"
                          : "bg-foreground-muted/35",
                  )}
                  style={{
                    height: `${height}px`,
                    animationDelay: `${index * 120}ms`,
                    animationDuration: "900ms",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-center">
            <div className="rounded-full border border-border bg-background-secondary px-3 py-1 text-xs text-foreground-muted">
              {conversationVisualState === "listening"
                ? "Mic live"
                : conversationVisualState === "speaking"
                  ? "Voice reply"
                  : conversationVisualState === "thinking"
                    ? "AI responding"
                    : "Waiting for speech"}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderModelPicker = (className?: string) => (
    <div className="flex items-center gap-2">
      <select
        value={activeModel?.id ?? ""}
        disabled={!modelsQuery.data?.length}
        onChange={(event) =>
          setSelectedModelIds((current) => ({
            ...current,
            [modelSelectionScope]: event.target.value,
          }))
        }
        className={cn(
          "max-w-52 rounded-full border border-border bg-background-secondary/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm outline-none backdrop-blur",
          "cursor-pointer hover:bg-surface-raised",
          className,
        )}
      >
        {modelsQuery.data?.map((model) => (
          <option key={model.id} value={model.id}>
            {model.display_name}
          </option>
        ))}
      </select>
      {activeModel?.capabilities?.vision ? (
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground-muted"
          title="Vision-capable model"
          aria-label="Vision-capable model"
        >
          <Eye className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );

  const renderComposer = () => (
    <div
      ref={composerRef}
      className="w-full"
    >
      <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-2.5 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none">
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
        <input
          ref={folderInputRef}
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
        {renderAttachmentChips()}
        <Textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask Olanma about your content"
          className={cn(
            "resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-sm leading-5 shadow-none focus:ring-0",
            "min-h-0 max-h-24",
          )}
        />
        <div className="mt-1.5 flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            {renderModelPicker("max-w-44 bg-background-secondary")}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openFolderPicker}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground-muted transition-colors hover:bg-surface-raised"
              title="Attach folder"
              aria-label="Attach folder"
            >
              <FolderOpen className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background-secondary text-foreground-muted transition-colors hover:bg-surface-raised"
              title="Attach file"
              aria-label="Attach file"
            >
              <Paperclip className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={busy || !isVoiceSupported}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors",
                isListening
                  ? "border-primary/30 bg-primary/12 text-primary hover:bg-primary/16"
                  : "bg-background-secondary text-foreground-muted hover:bg-surface-raised",
                !isVoiceSupported ? "cursor-not-allowed opacity-60" : "",
              )}
              title={isVoiceSupported ? (isListening ? "Stop voice input" : "Use your microphone") : "Voice input is not supported in this browser"}
              aria-label={isVoiceSupported ? (isListening ? "Stop voice input" : "Use voice input") : "Voice input is not supported in this browser"}
            >
              {isListening ? <Square className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={toggleConversationMode}
              disabled={busy || !isVoiceSupported || !isSpeechSupported}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors",
                conversationMode
                  ? "border-primary/30 bg-primary/12 text-primary hover:bg-primary/16"
                  : "bg-background-secondary text-foreground-muted hover:bg-surface-raised",
                !isVoiceSupported || !isSpeechSupported ? "cursor-not-allowed opacity-60" : "",
              )}
              title={
                isVoiceSupported && isSpeechSupported
                  ? conversationMode
                    ? "Turn off conversation mode"
                    : "Turn on conversation mode"
                  : "Conversation mode is not supported in this browser"
              }
              aria-label={
                isVoiceSupported && isSpeechSupported
                  ? conversationMode
                    ? "Turn off conversation mode"
                    : "Turn on conversation mode"
                  : "Conversation mode is not supported in this browser"
              }
            >
              <MessageCircle className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isSpeechSupported) {
                  setVoiceStatus("Read aloud is not supported in this browser.");
                  return;
                }
                if (conversationMode) {
                  setConversationMode(false);
                }
                if (speakingMessageId) {
                  stopAssistantSpeech();
                }
                setAutoReadAloud((current) => !current);
              }}
              disabled={busy || !isSpeechSupported}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border transition-colors",
                autoReadAloud
                  ? "border-primary/30 bg-primary/12 text-primary hover:bg-primary/16"
                  : "bg-background-secondary text-foreground-muted hover:bg-surface-raised",
                !isSpeechSupported ? "cursor-not-allowed opacity-60" : "",
              )}
              title={
                isSpeechSupported
                  ? autoReadAloud
                    ? "Disable automatic read aloud"
                    : "Enable automatic read aloud"
                  : "Read aloud is not supported in this browser"
              }
              aria-label={
                isSpeechSupported
                  ? autoReadAloud
                    ? "Disable automatic read aloud"
                    : "Enable automatic read aloud"
                  : "Read aloud is not supported in this browser"
              }
            >
              <Volume2 className="h-3 w-3" />
            </button>
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
        {voiceStatus ? (
          <p className={cn("mt-1 text-[11px]", isListening ? "text-primary" : "text-foreground-muted")}>
            {voiceStatus}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-foreground-muted">
          Add a single video, mixed files, or a whole folder and keep the analysis inside this chat.
        </p>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background mb-4",
        isDragging ? "bg-primary/5" : "",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(dragDepthRef.current, 1);
        setIsDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        void handleFiles(event.dataTransfer.files);
      }}
    >
      {showDropOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[1.75rem] border border-dashed border-primary/40 bg-surface/95 px-8 py-12 text-center shadow-[0_18px_60px_rgba(20,32,25,0.08)] dark:shadow-none">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">Drop files into this chat</h3>
            <p className="mt-2 text-sm text-foreground-muted">
              Add PDFs, documents, images, audio, video, or a whole folder and Olanma will attach them to this conversation.
            </p>
            <div className="mt-4 inline-flex items-center rounded-full border border-border bg-background-secondary px-3 py-1 text-xs text-foreground-muted">
              Uploads appear directly in the composer when dropped
            </div>
          </div>
        </div>
      ) : null}

      {!modelsQuery.data?.length ? (
        <div className="border-b border-border bg-background/90 px-4 py-2 text-center text-xs text-foreground-muted sm:px-5">
          No synced models yet. Save or refresh a provider to load available models.
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={historyRef} className="h-full min-h-0 overflow-y-auto overscroll-contain">
        {hasConversation ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
            {visibleMessages.map((message) => {
              const isUser = message.role === "user";
              const isTransient = message.id.startsWith("temp-") || message.status === "streaming";
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
                        <div className="rounded-[1.35rem] border border-border bg-surface px-4 py-2.5 shadow-[0_12px_35px_rgba(20,32,25,0.05)] dark:shadow-none">
                          <Textarea
                            ref={editingTextareaRef}
                            rows={1}
                            value={editingDraft}
                            onChange={(event) => setEditingDraft(event.target.value)}
                            onKeyDown={(event) => handleEditKeyDown(event, message.id)}
                            placeholder="Edit your message..."
                            className={cn(
                              "resize-none overflow-y-auto border-0 bg-transparent px-0 py-0 text-[13px] leading-6 shadow-none focus:ring-0 sm:text-sm",
                              "min-h-0 max-h-48",
                            )}
                          />
                          <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                            <p className="text-[11px] text-foreground-muted">
                              Press Enter to save and Shift + Enter for a new line
                            </p>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-7 border border-border px-2.5 text-[11px]"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingDraft("");
                                  setBranchResetFromMessageId(null);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                className="h-7 px-2.5 text-[11px]"
                                onClick={() => {
                                  setBranchResetFromMessageId(message.id);
                                  editMessage.mutate(message.id);
                                }}
                                disabled={editMessage.isPending || !editingDraft.trim()}
                              >
                                Save
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {message.role === "assistant" && message.status === "streaming" && !hasReceivedStreamToken ? (
                          <div className="flex items-center gap-2 text-[13px] text-foreground-muted sm:text-sm">
                            <span>Thinking</span>
                            <span className="animate-pulse">...</span>
                          </div>
                        ) : (
                          <MessageMarkdown content={message.content} className="wrap-break-word" />
                        )}
                        {Array.isArray(message.metadata?.attachments) && message.metadata.attachments.length ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {(message.metadata.attachments as Array<{ id?: string; name: string; kind: PendingAttachment["kind"] }>).map((attachment) => {
                              const Icon = attachmentIcon(attachment.kind);
                              return (
                                <div
                                  key={`${message.id}-${attachment.name}`}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-[11px] text-foreground-muted"
                                >
                                  <Icon className="h-3 w-3" />
                                  {attachment.name}
                                  {attachment.id ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewAttachment({
                                          id: attachment.id!,
                                          name: attachment.name,
                                          kind: attachment.kind,
                                        })
                                      }
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-foreground-muted transition hover:bg-background hover:text-foreground"
                                      title="Preview attachment"
                                    >
                                      <Eye className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {!isUser ? <RAGReferences message={message} /> : null}
                        <div className="mt-2.5 flex gap-2">
                          {isUser ? (
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              className="h-7 border border-border px-2.5 text-[11px]"
                              disabled={isTransient}
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setEditingDraft(message.content);
                              }}
                            >
                              <PencilLine className="h-3 w-3" />
                              <span className="ml-1.5">Edit</span>
                            </Button>
                          ) : (
                            <>
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-7 border border-border px-2.5 text-[11px]"
                                disabled={isTransient || !isSpeechSupported}
                                onClick={() => toggleSpeechPlayback(message.id, message.content)}
                              >
                                {speakingMessageId === message.id ? <Square className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                                <span className="ml-1.5">{speakingMessageId === message.id ? "Stop" : "Read"}</span>
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                className="h-7 border border-border px-2.5 text-[11px]"
                                disabled={isTransient}
                                onClick={async () => {
                                  await navigator.clipboard.writeText(message.content);
                                  setCopiedMessageId(message.id);
                                  setTimeout(() => setCopiedMessageId(null), 1500);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                                <span className="ml-1.5">{copiedMessageId === message.id ? "Copied" : "Copy"}</span>
                              </Button>
                            </>
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
          <div className="flex min-h-full items-center justify-center px-4 py-5 sm:px-5">
            <div className="w-full max-w-190">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/12 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-center text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                How can I help?
              </h2>
              <p className="mx-auto mt-2 max-w-xl text-center text-[13px] text-foreground-muted">
                Drop in a single video or a whole folder, ask questions in chat, and keep the analysis in one thread.
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => handleQuickAction(action)}
                    className="rounded-full border border-border bg-background-secondary px-4 py-2 text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="mx-auto mt-4 max-w-162.5 rounded-2xl border border-border bg-surface">
                {starterPrompts.map((prompt, index) => (
                  <div key={prompt}>
                    {index > 0 ? <div className="border-t border-border" /> : null}
                    <button
                      type="button"
                      onClick={() => sendSuggestedPrompt(prompt)}
                      className="w-full rounded-2xl px-4 py-3 text-left text-sm text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-3 z-20 bg-background/88 px-4 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          {renderComposer()}
          {streamError || createConversation.error || sendMessage.error || uploadAttachment.error || editMessage.error ? (
            <p className="mt-3 text-center text-sm text-primary">
              {streamError ?? (createConversation.error ?? sendMessage.error ?? uploadAttachment.error ?? editMessage.error)?.message}
            </p>
          ) : null}
        </div>
      </div>

      {previewAttachment ? (
        <AssetPreviewDialog
          open={Boolean(previewAttachment)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewAttachment(null);
            }
          }}
          resourceType={previewAttachment.kind}
          resourceId={previewAttachment.id}
          name={previewAttachment.name}
        />
      ) : null}
      {renderConversationDialog()}
    </div>
  );
}
