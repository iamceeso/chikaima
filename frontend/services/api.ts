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
  WorkspaceConfig,
  WorkspacePublicSettings,
  VideoAsset,
} from "@/types";

type RequestOptions = RequestInit & {
  token?: string | null;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
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

export const api = {
  getPublicWorkspaceSettings: () => request<WorkspacePublicSettings>("/settings/public"),
  register: (payload: { email: string; full_name: string; password: string }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: (token: string) => request<{ message: string }>("/auth/logout", { method: "POST", token }),
  getProfile: (token: string) => request<User>("/users/me", { token }),
  getUsers: (token: string) => request<User[]>("/users", { token }),
  createUser: (
    token: string,
    payload: { email: string; full_name: string; password: string; is_superuser?: boolean; is_active?: boolean },
  ) => request<User>("/users", { method: "POST", token, body: JSON.stringify(payload) }),
  deleteUser: (token: string, userId: string) => request<void>(`/users/${userId}`, { method: "DELETE", token }),
  getDashboard: (token: string) => request<DashboardSummary>("/dashboard", { token }),
  getWorkspaceSettings: (token: string) => request<WorkspaceConfig>("/settings/workspace", { token }),
  updateWorkspaceSettings: (
    token: string,
    payload: { name?: string; public_registration_enabled?: boolean },
  ) => request<WorkspaceConfig>("/settings/workspace", { method: "PATCH", token, body: JSON.stringify(payload) }),
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
