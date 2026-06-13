"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface AdminAuthState {
  email: string;
  authHeader: string;
  hydrated: boolean;
  setCredentials: (email: string, authHeader: string) => void;
  clearCredentials: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      email: "",
      authHeader: "",
      hydrated: false,
      setCredentials: (email, authHeader) => set({ email, authHeader }),
      clearCredentials: () => set({ email: "", authHeader: "" }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "olanma-admin-auth",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ email: state.email, authHeader: state.authHeader }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
