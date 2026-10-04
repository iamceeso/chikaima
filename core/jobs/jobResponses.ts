import type { JobRow } from "./repository.js";

export interface JobResponse {
  id: string;
  user_id: string;
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

export function toJobResponse(row: JobRow): JobResponse {
  return {
    id: row.id,
    user_id: row.userId,
    job_type: row.jobType,
    status: row.status,
    resource_type: row.resourceType,
    resource_id: row.resourceId,
    payload: row.payload as Record<string, unknown>,
    result: row.result as Record<string, unknown>,
    progress: row.progress,
    attempts: row.attempts,
    max_attempts: row.maxAttempts,
    depends_on: row.dependsOn,
    error_message: row.errorMessage,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
