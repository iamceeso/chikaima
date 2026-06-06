"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuthProfile } from "@/hooks/use-auth";
import { useAuthStore } from "@/store/auth-store";

export function AuthenticatedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((state) => state.hydrated);
  const tokens = useAuthStore((state) => state.tokens);
  const clearSession = useAuthStore((state) => state.clearSession);
  const profileQuery = useAuthProfile();
  const refetchProfile = profileQuery.refetch;

  useEffect(() => {
    if (!hydrated || !tokens?.access_token) {
      return;
    }

    void refetchProfile();
  }, [hydrated, pathname, refetchProfile, tokens?.access_token]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!tokens?.access_token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (profileQuery.isError) {
      clearSession();
      router.replace("/login");
    }
  }, [clearSession, hydrated, pathname, profileQuery.isError, router, tokens?.access_token]);

  if (!hydrated || (tokens?.access_token && profileQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-foreground-muted">Loading workspace...</p>
      </div>
    );
  }

  if (!tokens?.access_token) {
    return null;
  }

  return <>{children}</>;
}
