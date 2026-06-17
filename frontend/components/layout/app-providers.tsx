"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { SESSIONLESS_ACCESS_TOKEN } from "@/lib/auth";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

function WorkspaceAccessBootstrap() {
  const tokens = useAuthStore((state) => state.tokens);
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 30_000,
  });
  useQuery({
    queryKey: ["profile", tokens?.access_token],
    queryFn: async () => {
      if (!tokens?.access_token || tokens.access_token === SESSIONLESS_ACCESS_TOKEN) {
        return null;
      }
      const profile = await api.getProfile(tokens.access_token);
      setUser(profile);
      return profile;
    },
    enabled: Boolean(tokens?.access_token) && tokens.access_token !== SESSIONLESS_ACCESS_TOKEN,
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!workspaceQuery.data) {
      return;
    }

    const usingSessionlessToken = tokens?.access_token === SESSIONLESS_ACCESS_TOKEN;

    if (workspaceQuery.data.authentication_enabled === false) {
      if (!usingSessionlessToken) {
        setSession({
          access_token: SESSIONLESS_ACCESS_TOKEN,
          refresh_token: "",
          token_type: "bearer",
        }, null);
        setUser(null);
      }
      return;
    }

    if (usingSessionlessToken) {
      clearSession();
    }
  }, [clearSession, setSession, tokens?.access_token, workspaceQuery.data]);

  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceAccessBootstrap />
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
