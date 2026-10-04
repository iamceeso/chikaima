export type ProviderType =
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "openrouter"
  | "litellm"
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
  authentication_enabled: boolean;
  docs_enabled: boolean;
  public_registration_enabled: boolean;
  vision_aware: boolean;
  first_user_registration_required: boolean;
  total_users: number;
  total_providers: number;
  pending_jobs: number;
  completed_jobs: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePublicSettings {
  name: string;
  authentication_enabled: boolean;
  docs_enabled: boolean;
  public_registration_enabled: boolean;
  first_user_registration_required: boolean;
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
  support_tier?: "verified" | "partial" | "unverified";
  masked_secret: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModel {
  id: string;
  provider_id: string;
  provider_name?: string | null;
  provider_type?: ProviderType | null;
  model_key: string;
  display_name: string;
  capabilities: Record<string, boolean>;
  is_default: boolean;
  is_available: boolean;
  is_deprecated?: boolean;
  is_economy?: boolean;
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

export interface RAGCitation {
  source_type: string;
  source_id: string;
  asset_type?: string;
  filename: string;
  chunk_id: string;
  chunk_index: number;
  reference: string;
  excerpt?: string;
  location?: Record<string, string | number>;
  score: number;
}

export type AssetResourceType = "document" | "audio" | "video";

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
  progress: number;
  attempts: number;
  max_attempts: number;
  depends_on: string[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobEvent {
  id: number;
  job_id: string;
  event_type: "queued" | "started" | "stage" | "completed" | "retry_scheduled" | "failed" | "cancelled" | "recovered";
  message: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface JobDetail extends Job {
  events: JobEvent[];
}

export interface DocumentAsset {
  metadata: Record<string, unknown>;
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

export interface LibraryBundle {
  audio: AudioAsset[];
  videos: VideoAsset[];
  documents: DocumentAsset[];
}

export interface DashboardSummary {
  providers: number;
  models: number;
  documents: number;
  videos: number;
  jobs: number;
  system_health: string;
}

export type CollabRole = "lead" | "implementer" | "reviewer" | "tester";
export type CollabDecisionPolicy = "majority" | "unanimous" | "precedence";
export type CollabAutonomy = "supervised" | "semi" | "autonomous";
export type CollabPermission = "edit" | "delete" | "run_tests" | "run_commands" | "review";
export type CollabRunStatus = "queued" | "running" | "awaiting_approval" | "cancelling" | "completed" | "failed" | "cancelled";

export interface CollabMember {
  id: string;
  model_id: string;
  name: string;
  title: string;
  role: CollabRole;
  instructions: string;
  precedence: number;
  scope: string[];
  permissions: CollabPermission[];
  reports_to: number | null;
  reviewed_by: number[];
}

export interface CollabTeam {
  id: string;
  name: string;
  folder: string;
  decision_policy: CollabDecisionPolicy;
  max_revisions: number;
  autonomy: CollabAutonomy;
  test_command: string | null;
  max_model_calls: number;
  members: CollabMember[];
  created_at: string;
  updated_at: string;
}

export interface CollabMemberInput {
  model_id: string;
  name?: string;
  title?: string;
  role: CollabRole;
  instructions?: string;
  precedence: number;
  scope?: string[];
  permissions?: CollabPermission[];
  reports_to?: number | null;
  reviewed_by?: number[];
}

export interface CollabTeamInput {
  name: string;
  folder: string;
  decision_policy: CollabDecisionPolicy;
  max_revisions: number;
  autonomy: CollabAutonomy;
  test_command: string | null;
  max_model_calls: number;
  members: CollabMemberInput[];
}

export interface CollabTemplate {
  id: string;
  name: string;
  description: string;
  autonomy: CollabAutonomy;
  decision_policy: CollabDecisionPolicy;
  test_command: string | null;
  members: Array<Required<Omit<CollabMemberInput, "model_id" | "name">>>;
}

export interface CollabApproval {
  id: string;
  run_id: string;
  member_id: string | null;
  kind: "command" | "delete" | "sensitive_file" | "step";
  summary: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CollabFileEntry {
  path: string;
  type: "file" | "dir";
}

export interface CollabRun {
  id: string;
  team_id: string;
  task: string;
  status: CollabRunStatus;
  result: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CollabMessage {
  id: number;
  run_id: string;
  member_id: string | null;
  kind: "system" | "plan" | "message" | "action" | "command" | "change" | "review" | "decision" | "approval" | "summary" | "error";
  content: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface CollabRunDetail extends CollabRun {
  messages: CollabMessage[];
  approvals: CollabApproval[];
}
