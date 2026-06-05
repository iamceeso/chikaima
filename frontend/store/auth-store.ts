import { create } from "zustand";

import type { AuthTokens, User } from "@/types";

interface AuthState {
  tokens: AuthTokens | null;
  user: User | null;
  setSession: (tokens: AuthTokens, user?: User | null) => void;
  setUser: (user: User | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  tokens: null,
  user: null,
  setSession: (tokens, user = null) => set({ tokens, user }),
  setUser: (user) => set({ user }),
  clearSession: () => set({ tokens: null, user: null }),
}));
