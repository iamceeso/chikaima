import type { QueryClient } from "@tanstack/react-query";

import { api } from "@/services/api";

export const libraryQueryKey = ["library"] as const;

export function prefetchLibrary(queryClient: QueryClient, token: string) {
  return queryClient.prefetchQuery({
    queryKey: libraryQueryKey,
    queryFn: () => api.getLibraryBundle(token),
    staleTime: 30_000,
  });
}
