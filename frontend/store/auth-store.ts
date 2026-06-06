import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { AuthTokens, User } from "@/types";

interface AuthState {
  tokens: AuthTokens | null;
  user: User | null;
  hydrated: boolean;
  setSession: (tokens: AuthTokens, user?: User | null) => void;
  setUser: (user: User | null) => void;
  clearSession: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      tokens: null,
      user: null,
      hydrated: false,
      setSession: (tokens, user = null) => set({ tokens, user }),
      setUser: (user) => set({ user }),
      clearSession: () => set({ tokens: null, user: null }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "olanma-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ tokens: state.tokens, user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
