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
  error_message: string | null;
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
    error_message: row.errorMessage,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
