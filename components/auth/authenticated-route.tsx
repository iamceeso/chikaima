"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuthProfile } from "@/hooks/use-auth";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((state) => state.hydrated);
  const tokens = useAuthStore((state) => state.tokens);
  const clearSession = useAuthStore((state) => state.clearSession);
  const profileQuery = useAuthProfile();
  const publicWorkspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const authRequired = publicWorkspaceQuery.data?.authentication_enabled !== false;
  const firstUserRequired = publicWorkspaceQuery.data?.first_user_registration_required === true;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (firstUserRequired) {
      router.replace("/register");
      return;
    }

    if (!authRequired) {
      return;
    }

    if (!tokens?.access_token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (profileQuery.isError) {
      clearSession();
      router.replace("/");
    }
  }, [authRequired, clearSession, firstUserRequired, hydrated, pathname, profileQuery.isError, router, tokens?.access_token]);

  if (!hydrated || publicWorkspaceQuery.isLoading || (authRequired && tokens?.access_token && profileQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-foreground-muted">Loading workspace...</p>
      </div>
    );
  }

  if (publicWorkspaceQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-foreground">Could not load workspace.</p>
          <p className="mt-2 text-sm text-foreground-muted">
            {publicWorkspaceQuery.error instanceof Error
              ? publicWorkspaceQuery.error.message
              : "Check that the backend is running and try again."}
          </p>
        </div>
      </div>
    );
  }

  if (authRequired && tokens?.access_token && profileQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-foreground">Could not load your session.</p>
          <p className="mt-2 text-sm text-foreground-muted">
            {profileQuery.error instanceof Error ? profileQuery.error.message : "Please sign in again."}
          </p>
        </div>
      </div>
    );
  }

  if (firstUserRequired) {
    return null;
  }

  if (authRequired && !tokens?.access_token) {
    return null;
  }

  return <>{children}</>;
}
