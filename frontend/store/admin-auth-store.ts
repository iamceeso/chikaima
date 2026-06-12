"use client";

import { create } from "zustand";

interface AdminAuthState {
  email: string;
  password: string;
  setCredentials: (email: string, password: string) => void;
  clearCredentials: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()((set) => ({
  email: "",
  password: "",
  setCredentials: (email, password) => set({ email, password }),
  clearCredentials: () => set({ email: "", password: "" }),
}));
