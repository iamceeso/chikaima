export type ProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openai_compatible"
  | "local";

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  public_registration_enabled: boolean;
  total_users: number;
  total_providers: number;
  pending_jobs: number;
  completed_jobs: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePublicSettings {
  name: string;
  public_registration_enabled: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface Provider {
  id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string | null;
  is_enabled: boolean;
  masked_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModel {
  id: string;
  provider_id: string;
  model_key: string;
  display_name: string;
  capabilities: Record<string, boolean>;
  is_default: boolean;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant";
  content: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  folder: string | null;
  model_id: string | null;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  job_type: string;
  status: string;
  resource_type: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentAsset {
  id: string;
  name: string;
  file_path: string;
  mime_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AudioAsset {
  id: string;
  name: string;
  file_path: string;
  transcript: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VideoAsset {
  id: string;
  name: string;
  file_path: string;
  transcript: string | null;
  summary: string | null;
  chapters: unknown[];
  action_items: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  providers: number;
  models: number;
  documents: number;
  videos: number;
  jobs: number;
  system_health: string;
}
