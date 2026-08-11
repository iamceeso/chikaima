import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  hashedPassword: text("hashed_password").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  isSuperuser: integer("is_superuser", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
});

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  baseUrl: text("base_url"),
  encryptedConfig: text("encrypted_config", { mode: "json" }).notNull().default("{}"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const aiModels = sqliteTable("ai_models", {
  id: text("id").primaryKey(),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id),
  modelKey: text("model_key").notNull(),
  displayName: text("display_name").notNull(),
  capabilities: text("capabilities", { mode: "json" }).notNull().default("{}"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isAvailable: integer("is_available", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  folder: text("folder"),
  modelId: text("model_id").references(() => aiModels.id),
  ...timestamps,
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: text("role").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("completed"),
  meta: text("metadata", { mode: "json" }).notNull().default("{}"),
  ...timestamps,
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  summary: text("summary"),
  status: text("status").notNull().default("pending"),
  ...timestamps,
});

export const audioAssets = sqliteTable("audio_assets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  transcript: text("transcript"),
  status: text("status").notNull().default("pending"),
  ...timestamps,
});

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  transcript: text("transcript"),
  summary: text("summary"),
  chapters: text("chapters", { mode: "json" }).notNull().default("[]"),
  actionItems: text("action_items", { mode: "json" }).notNull().default("[]"),
  status: text("status").notNull().default("pending"),
  ...timestamps,
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("queued"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  payload: text("payload", { mode: "json" }).notNull().default("{}"),
  result: text("result", { mode: "json" }).notNull().default("{}"),
  progress: integer("progress").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorMessage: text("error_message"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  ...timestamps,
});

export const settingsTable = sqliteTable("settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  theme: text("theme").notNull().default("dark"),
  defaultModelId: text("default_model_id"),
  preferences: text("preferences", { mode: "json" }).notNull().default("{}"),
  ...timestamps,
});

export const transcripts = sqliteTable("transcripts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  language: text("language"),
  content: text("content").notNull(),
  segments: text("segments", { mode: "json" }).notNull().default("[]"),
  status: text("status").notNull().default("completed"),
  ...timestamps,
});

export const workspaceConfigs = sqliteTable("workspace_configs", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Chikaima Workspace"),
  authenticationEnabled: integer("authentication_enabled", { mode: "boolean" }).notNull().default(true),
  docsEnabled: integer("docs_enabled", { mode: "boolean" }).notNull().default(false),
  publicRegistrationEnabled: integer("public_registration_enabled", { mode: "boolean" }).notNull().default(true),
  visionAware: integer("vision_aware", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

/**
 * Metadata for RAG chunks. The embedding vector itself lives in the
 * `asset_chunk_vectors` vec0 virtual table (see migration 0004), keyed by
 * this table's integer rowid so the two can be joined without a separate
 * id-mapping table. `id` is exposed to callers as `String(rowid)`.
 */
export const assetChunks = sqliteTable("asset_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  assetType: text("asset_type").notNull(),
  filename: text("filename").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  meta: text("metadata", { mode: "json" }).notNull().default("{}"),
  ...timestamps,
});

export const summaryArtifacts = sqliteTable("summary_artifacts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  summaryType: text("summary_type").notNull(),
  content: text("content"),
  data: text("data", { mode: "json" }).notNull().default("{}"),
  status: text("status").notNull().default("completed"),
  ...timestamps,
});
