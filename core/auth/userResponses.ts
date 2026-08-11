import type { UserRow } from "./repository.js";

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
}

export function toUserResponse(row: UserRow): UserResponse {
  return {
    id: row.id,
    email: row.email,
    full_name: row.fullName,
    is_active: row.isActive,
    is_superuser: row.isSuperuser,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
