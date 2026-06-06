"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuthStore } from "@/store/auth-store";

export function GuestRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useAuthStore((state) => state.hydrated);
  const tokens = useAuthStore((state) => state.tokens);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (tokens?.access_token) {
      const next = searchParams.get("next") || "/library";
      router.replace(next);
    }
  }, [hydrated, router, searchParams, tokens?.access_token]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <p className="text-sm text-foreground-muted">Loading...</p>
      </div>
    );
  }

  if (tokens?.access_token) {
    return null;
  }

  return <>{children}</>;
}
