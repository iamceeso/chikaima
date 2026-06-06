import { env } from "@/lib/env";
import type {
  AIModel,
  AudioAsset,
  AuthTokens,
  Conversation,
  DashboardSummary,
  DocumentAsset,
  Job,
  Provider,
  User,
  VideoAsset,
} from "@/types";

type RequestOptions = RequestInit & {
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "Request failed");
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  register: (payload: { email: string; full_name: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  getProfile: (token: string) => request<User>("/users/me", { token }),
  getDashboard: (token: string) => request<DashboardSummary>("/dashboard", { token }),
  getProviders: (token: string) => request<Provider[]>("/providers", { token }),
  createProvider: (
    token: string,
    payload: {
      name: string;
      provider_type: string;
      base_url?: string;
      api_key?: string;
      config?: Record<string, unknown>;
    },
  ) => request<Provider>("/providers", { method: "POST", token, body: JSON.stringify(payload) }),
  getModels: (token: string) => request<AIModel[]>("/models", { token }),
  getDocuments: (token: string) => request<DocumentAsset[]>("/documents", { token }),
  getAudioAssets: (token: string) => request<AudioAsset[]>("/audio", { token }),
  getVideos: (token: string) => request<VideoAsset[]>("/video", { token }),
  getConversations: (token: string) => request<Conversation[]>("/chat/conversations", { token }),
  createConversation: (
    token: string,
    payload: { title: string; folder?: string; model_id?: string; initial_message?: string },
  ) => request<Conversation>("/chat/conversations", { method: "POST", token, body: JSON.stringify(payload) }),
  sendMessage: (
    token: string,
    conversationId: string,
    payload: { role: string; content: string },
  ) =>
    request(`/chat/conversations/${conversationId}/messages`, {
      method: "POST",
      token,
      body: JSON.stringify(payload),
    }),
  getJobs: (token: string) => request<Job[]>("/jobs", { token }),
};
