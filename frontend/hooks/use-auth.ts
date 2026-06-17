"use client";

import { useQuery } from "@tanstack/react-query";

import { SESSIONLESS_ACCESS_TOKEN } from "@/lib/auth";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export function useAuthProfile() {
  const tokens = useAuthStore((state) => state.tokens);
  const setUser = useAuthStore((state) => state.setUser);

  return useQuery({
    queryKey: ["profile", tokens?.access_token],
    queryFn: async () => {
      if (!tokens?.access_token || tokens.access_token === SESSIONLESS_ACCESS_TOKEN) {
        return null;
      }
      const user = await api.getProfile(tokens.access_token);
      setUser(user);
      return user;
    },
    enabled: Boolean(tokens?.access_token) && tokens.access_token !== SESSIONLESS_ACCESS_TOKEN,
    retry: false,
    staleTime: 5 * 60_000,
  });
}
