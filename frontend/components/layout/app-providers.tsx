"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

const SESSIONLESS_ACCESS_TOKEN = "__olanma_no_auth__";

function WorkspaceAccessBootstrap() {
  const tokens = useAuthStore((state) => state.tokens);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!workspaceQuery.data) {
      return;
    }

    const usingSessionlessToken = tokens?.access_token === SESSIONLESS_ACCESS_TOKEN;

    if (workspaceQuery.data.authentication_enabled === false) {
      if (!tokens?.access_token) {
        setSession({
          access_token: SESSIONLESS_ACCESS_TOKEN,
          refresh_token: "",
          token_type: "bearer",
        });
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
