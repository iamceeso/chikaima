import { env } from "../lib/env";
import type {
  AIModel,
  AssetResourceType,
  AudioAsset,
  AuthTokens,
  Conversation,
  DashboardSummary,
  DocumentAsset,
  Job,
  LibraryBundle,
  Message,
  Provider,
  User,
  WorkspaceConfig,
  WorkspacePublicSettings,
  VideoAsset,
} from "@/types";

export type ApiAccess = {
  token?: string | null;
  authHeader?: string | null;
};

type RequestOptions = RequestInit & {
  token?: string | null;
  authHeader?: string | null;
};

const REQUEST_TIMEOUT_MS = 10_000;

type StreamChatPayload = {
  content: string;
  conversation_id?: string;
  title?: string;
  model_id?: string;
  metadata?: Record<string, unknown>;
  use_rag?: boolean;
};

type StreamChatHandlers = {
  onMetadata?: (metadata: Record<string, unknown>) => void;
  onToken?: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.authHeader) {
    headers.set("Authorization", options.authHeader);
  } else if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...options,
      headers,
      cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
      signal: options.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Check that the backend is running.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    let message = body || "Request failed";
    if (body.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(body) as { detail?: string };
        message = parsed.detail || message;
      } catch {
        message = body || "Request failed";
      }
    }
    throw new Error(message);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (options.authHeader) {
    headers.set("Authorization", options.authHeader);
  } else if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...options,
      headers,
      cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
      signal: options.signal ?? controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. Check that the backend is running.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.blob();
}

export const apiTestUtils = {
  request,
  requestBlob,
};

export const api = {
  getPublicWorkspaceSettings: () => request<WorkspacePublicSettings>("/settings/public"),
  register: (payload: { email: string; full_name: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: (token: string) => request<{ message: string }>("/auth/logout", { method: "POST", token }),
  getProfile: (token: string) => request<User>("/users/me", { token }),
  getUsers: (access: ApiAccess) => request<User[]>("/users", access),
  createUser: (
    access: ApiAccess,
    payload: { email: string; full_name: string; password: string; is_superuser?: boolean; is_active?: boolean },
  ) => request<User>("/users", { method: "POST", ...access, body: JSON.stringify(payload) }),
  updateUser: (
    access: ApiAccess,
    userId: string,
    payload: { email?: string; full_name?: string; password?: string; is_superuser?: boolean; is_active?: boolean },
  ) => request<User>(`/users/${userId}`, { method: "PATCH", ...access, body: JSON.stringify(payload) }),
  deleteUser: (access: ApiAccess, userId: string) => request<void>(`/users/${userId}`, { method: "DELETE", ...access }),
  getDashboard: (token: string) => request<DashboardSummary>("/dashboard", { token }),
  getWorkspaceSettings: (access: ApiAccess) => request<WorkspaceConfig>("/settings/workspace", access),
  updateWorkspaceSettings: (
    access: ApiAccess,
    payload: { name?: string; authentication_enabled?: boolean; docs_enabled?: boolean; public_registration_enabled?: boolean; vision_aware?: boolean },
  ) => request<WorkspaceConfig>("/settings/workspace", { method: "PATCH", ...access, body: JSON.stringify(payload) }),
  getWorkspaceModels: (access: ApiAccess) => request<AIModel[]>("/settings/models", access),
  updateWorkspaceModels: (access: ApiAccess, payload: { enabled_model_ids: string[]; default_model_id?: string | null }) =>
    request<AIModel[]>("/settings/models", { method: "PATCH", ...access, body: JSON.stringify(payload) }),
  getProviders: (access: ApiAccess) => request<Provider[]>("/providers", access),
  createProvider: (
    access: ApiAccess,
    payload: {
      name: string;
      provider_type: string;
      base_url?: string;
      api_key?: string;
      config?: Record<string, unknown>;
    },
  ) => request<Provider>("/providers", { method: "POST", ...access, body: JSON.stringify(payload) }),
  updateProvider: (
    access: ApiAccess,
    providerId: string,
    payload: {
      name?: string;
      base_url?: string;
      is_enabled?: boolean;
      api_key?: string;
      config?: Record<string, unknown>;
    },
  ) => request<Provider>(`/providers/${providerId}`, { method: "PATCH", ...access, body: JSON.stringify(payload) }),
  resyncProviderModels: (access: ApiAccess, providerId: string) =>
    request<Provider>(`/providers/${providerId}/resync`, { method: "POST", ...access }),
  deleteProvider: (access: ApiAccess, providerId: string) =>
    request<void>(`/providers/${providerId}`, { method: "DELETE", ...access }),
  getModels: (token: string) => request<AIModel[]>("/models", { token }),
  getLibraryBundle: (token: string) => request<LibraryBundle>("/library", { token }),
  getAssetFile: (token: string, resourceType: AssetResourceType, resourceId: string) =>
    requestBlob(`/assets/${resourceType}/${resourceId}/file`, { token }),
  getDocuments: (token: string) => request<DocumentAsset[]>("/documents", { token }),
  deleteDocument: (token: string, documentId: string) =>
    request<void>(`/documents/${documentId}`, { method: "DELETE", token }),
  clearDocuments: (token: string) => request<void>("/documents", { method: "DELETE", token }),
  uploadDocument: (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<DocumentAsset>("/documents/upload", { method: "POST", token, body: formData });
  },
  getAudioAssets: (token: string) => request<AudioAsset[]>("/audio", { token }),
  deleteAudioAsset: (token: string, audioId: string) => request<void>(`/audio/${audioId}`, { method: "DELETE", token }),
  clearAudioAssets: (token: string) => request<void>("/audio", { method: "DELETE", token }),
  uploadAudio: (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<AudioAsset>("/audio/upload", { method: "POST", token, body: formData });
  },
  getVideos: (token: string) => request<VideoAsset[]>("/video", { token }),
  getTranscript: (token: string, resourceType: AssetResourceType, resourceId: string) => {
    if (resourceType === "document") {
      return request<{ content: string }>(`/documents/${resourceId}/transcript`, { token });
    }
    if (resourceType === "audio") {
      return request<{ content: string }>(`/audio/${resourceId}/transcript`, { token });
    }
    return request<{ content: string }>(`/video/${resourceId}/transcript`, { token });
  },
  deleteVideo: (token: string, videoId: string) => request<void>(`/video/${videoId}`, { method: "DELETE", token }),
  clearVideos: (token: string) => request<void>("/video", { method: "DELETE", token }),
  uploadVideo: (token: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<VideoAsset>("/video/upload", { method: "POST", token, body: formData });
  },
  getConversations: (token: string) => request<Conversation[]>("/chat/conversations", { token }),
  createConversation: (
    token: string,
    payload: { title: string; folder?: string; model_id?: string; initial_message?: string; initial_metadata?: Record<string, unknown> },
  ) => request<Conversation>("/chat/conversations", { method: "POST", token, body: JSON.stringify(payload) }),
  deleteConversation: (token: string, conversationId: string) =>
    request<void>(`/chat/conversations/${conversationId}`, { method: "DELETE", token }),
  sendMessage: (
    token: string,
    conversationId: string,
    payload: { role: string; content: string; metadata?: Record<string, unknown> },
  ) =>
    request<Message>(`/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  updateMessage: (
    token: string,
    messageId: string,
    payload: { content: string },
  ) => request<Message>(`/chat/messages/${messageId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  }),
  regenerateMessage: (
    token: string,
    payload: { message_id: string },
  ) => request<Message>(`/chat/messages/regenerate`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  }),
  streamChat: async (
    token: string,
    payload: StreamChatPayload,
    handlers: StreamChatHandlers = {},
  ) => {
    const headers = new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
    const response = await fetch(`${env.apiBaseUrl}/chat/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || "Streaming request failed");
    }

    if (!response.body) {
      throw new Error("Streaming response body is unavailable.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const emitEvent = (eventName: string, data: string) => {
      if (!data.trim()) {
        return;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(data) as Record<string, unknown>;
      } catch {
        parsed = { detail: data };
      }

      if (eventName === "metadata") {
        handlers.onMetadata?.(parsed);
        return;
      }
      if (eventName === "token") {
        const text = parsed.text;
        if (typeof text === "string") {
          handlers.onToken?.(text);
        }
        return;
      }
      if (eventName === "done") {
        handlers.onDone?.();
        return;
      }
      if (eventName === "error") {
        handlers.onError?.(typeof parsed.detail === "string" ? parsed.detail : "Streaming failed");
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = rawEvent.split("\n");
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trim());
          }
        }

        emitEvent(eventName, dataLines.join("\n"));
        boundaryIndex = buffer.indexOf("\n\n");
      }

      if (done) {
        break;
      }
    }
  },
  getJobs: (token: string) => request<Job[]>("/jobs", { token }),
};
