"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useAuthStore((state) => state.hydrated);
  const tokens = useAuthStore((state) => state.tokens);
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const authRequired = workspaceQuery.data?.authentication_enabled !== false;
  const firstUserRequired = workspaceQuery.data?.first_user_registration_required === true;

  useEffect(() => {
    if (!hydrated || workspaceQuery.isLoading) {
      return;
    }

    if (!authRequired && !firstUserRequired) {
      router.replace("/library");
      return;
    }

    if (tokens?.access_token) {
      const next = searchParams.get("next") || "/library";
      router.replace(next);
    }
  }, [authRequired, firstUserRequired, hydrated, router, searchParams, tokens?.access_token, workspaceQuery.isLoading]);

  if (!hydrated || workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-foreground-muted">Loading...</p>
      </div>
    );
  }

  if ((!authRequired && !firstUserRequired) || tokens?.access_token) {
    return null;
  }

  return <>{children}</>;
}
