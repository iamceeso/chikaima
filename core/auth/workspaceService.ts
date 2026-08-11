import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { ChikaimaDatabase } from "../db/client.js";
import { aiModels, jobs, providers, users, workspaceConfigs } from "../db/schema.js";
import { forbidden } from "../errors.js";
import { buildModelResponse, type AIModelResponse } from "../providers/providerService.js";
import type { UserRow } from "./repository.js";

export type WorkspaceConfigRow = typeof workspaceConfigs.$inferSelect;

export interface WorkspaceConfigResponse {
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

export interface WorkspacePublicResponse {
  name: string;
  authentication_enabled: boolean;
  docs_enabled: boolean;
  public_registration_enabled: boolean;
  first_user_registration_required: boolean;
}

export interface WorkspaceConfigUpdateInput {
  name?: string | null;
  authenticationEnabled?: boolean | null;
  docsEnabled?: boolean | null;
  publicRegistrationEnabled?: boolean | null;
  visionAware?: boolean | null;
}

export interface WorkspaceModelVisibilityUpdateInput {
  enabledModelIds: string[];
  defaultModelId?: string | null;
  /** Mirrors Python's `"default_model_id" in payload.model_fields_set` — was the key present in the request body at all? */
  defaultModelIdProvided: boolean;
}

export class WorkspaceService {
  constructor(private readonly db: ChikaimaDatabase) {}

  getOrCreate(): WorkspaceConfigRow {
    const existing = this.db.select().from(workspaceConfigs).get();
    if (existing) return existing;

    const now = new Date().toISOString();
    const row: WorkspaceConfigRow = {
      id: randomUUID(),
      name: "Chikaima Workspace",
      authenticationEnabled: true,
      docsEnabled: false,
      publicRegistrationEnabled: true,
      visionAware: true,
      createdAt: now,
      updatedAt: now,
    };
    this.db.insert(workspaceConfigs).values(row).run();
    return row;
  }

  getSummary(actor: UserRow): WorkspaceConfigResponse {
    const workspace = this.getOrCreate();
    const totalUsers = this.db.select().from(users).all().length;
    const totalProviders = this.db.select().from(providers).where(eq(providers.userId, actor.id)).all().length;
    const actorJobs = this.db.select().from(jobs).where(eq(jobs.userId, actor.id)).all();

    return {
      id: workspace.id,
      name: workspace.name,
      authentication_enabled: workspace.authenticationEnabled,
      docs_enabled: workspace.docsEnabled,
      public_registration_enabled: workspace.publicRegistrationEnabled,
      vision_aware: workspace.visionAware,
      first_user_registration_required: totalUsers === 0,
      total_users: totalUsers,
      total_providers: totalProviders,
      pending_jobs: actorJobs.filter((job) => job.status === "queued" || job.status === "running").length,
      completed_jobs: actorJobs.filter((job) => job.status === "completed").length,
      created_at: workspace.createdAt,
      updated_at: workspace.updatedAt,
    };
  }

  getPublicSettings(): WorkspacePublicResponse {
    const workspace = this.getOrCreate();
    const totalUsers = this.db.select().from(users).all().length;
    return {
      name: workspace.name,
      authentication_enabled: workspace.authenticationEnabled,
      docs_enabled: workspace.docsEnabled,
      public_registration_enabled: workspace.publicRegistrationEnabled,
      first_user_registration_required: totalUsers === 0,
    };
  }

  update(actor: UserRow, payload: WorkspaceConfigUpdateInput, scopeUser?: UserRow): WorkspaceConfigResponse {
    if (!actor.isSuperuser) {
      throw forbidden("Admin access required");
    }

    const workspace = this.getOrCreate();
    const patch: Partial<WorkspaceConfigRow> = {};
    if (payload.name !== undefined && payload.name !== null) patch.name = payload.name;
    if (payload.authenticationEnabled !== undefined && payload.authenticationEnabled !== null) patch.authenticationEnabled = payload.authenticationEnabled;
    if (payload.docsEnabled !== undefined && payload.docsEnabled !== null) patch.docsEnabled = payload.docsEnabled;
    if (payload.publicRegistrationEnabled !== undefined && payload.publicRegistrationEnabled !== null) patch.publicRegistrationEnabled = payload.publicRegistrationEnabled;
    if (payload.visionAware !== undefined && payload.visionAware !== null) patch.visionAware = payload.visionAware;

    this.db
      .update(workspaceConfigs)
      .set({ ...patch, updatedAt: new Date().toISOString() })
      .where(eq(workspaceConfigs.id, workspace.id))
      .run();

    return this.getSummary(scopeUser ?? actor);
  }

  listModels(scopeUser: UserRow): AIModelResponse[] {
    const rows = this.db
      .select({ model: aiModels, provider: providers })
      .from(aiModels)
      .innerJoin(providers, eq(providers.id, aiModels.providerId))
      .where(eq(providers.userId, scopeUser.id))
      .all();

    return rows
      .sort((a, b) => {
        const providerName = a.provider.name.localeCompare(b.provider.name);
        if (providerName !== 0) return providerName;
        if (a.model.isDefault !== b.model.isDefault) return a.model.isDefault ? -1 : 1;
        return a.model.displayName.localeCompare(b.model.displayName);
      })
      .map((row) => buildModelResponse(row.model, row.provider));
  }

  updateModelVisibility(actor: UserRow, payload: WorkspaceModelVisibilityUpdateInput, scopeUser: UserRow): AIModelResponse[] {
    if (!actor.isSuperuser) {
      throw forbidden("Admin access required");
    }

    const enabledIds = new Set(payload.enabledModelIds);
    if (payload.defaultModelIdProvided && payload.defaultModelId) {
      enabledIds.add(payload.defaultModelId);
    }

    const models = this.db
      .select({ model: aiModels, providerId: providers.id })
      .from(aiModels)
      .innerJoin(providers, eq(providers.id, aiModels.providerId))
      .where(eq(providers.userId, scopeUser.id))
      .all()
      .map((row) => row.model);

    const currentDefault = models.find((model) => model.isDefault) ?? null;
    const now = new Date().toISOString();

    for (const model of models) {
      const isAvailable = enabledIds.has(model.id);
      let isDefault = model.isDefault;
      if (payload.defaultModelIdProvided) {
        isDefault = payload.defaultModelId !== null && payload.defaultModelId !== undefined && model.id === payload.defaultModelId;
      } else if (currentDefault && !enabledIds.has(currentDefault.id)) {
        isDefault = false;
      }
      this.db.update(aiModels).set({ isAvailable, isDefault, updatedAt: now }).where(eq(aiModels.id, model.id)).run();
    }

    return this.listModels(actor);
  }
}
