"use client";

import { useQuery } from "@tanstack/react-query";

import { buildBasicAuthHeader } from "@/lib/admin-auth";
import { api, type ApiAccess } from "@/services/api";
import { useAdminAuthStore } from "@/store/admin-auth-store";
import { useAuthStore } from "@/store/auth-store";

export function useAdminAccess() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
  const adminEmail = useAdminAuthStore((state) => state.email);
  const adminPassword = useAdminAuthStore((state) => state.password);

  const publicWorkspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 30_000,
  });

  const workspaceAuthDisabled = publicWorkspaceQuery.data?.authentication_enabled === false;
  const hasBearerAdminAccess = Boolean(!workspaceAuthDisabled && token && user?.is_superuser);
  const hasBasicAdminAccess = Boolean(workspaceAuthDisabled && adminEmail && adminPassword);

  let access: ApiAccess | null = null;
  if (hasBearerAdminAccess) {
    access = { token };
  } else if (hasBasicAdminAccess) {
    access = { authHeader: buildBasicAuthHeader(adminEmail, adminPassword) };
  }

  return {
    access,
    hasAdminAccess: Boolean(access),
    hasBearerAdminAccess,
    hasBasicAdminAccess,
    publicWorkspaceQuery,
    workspaceAuthDisabled,
  };
}
