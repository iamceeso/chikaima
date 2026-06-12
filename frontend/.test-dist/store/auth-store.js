"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuthStore = void 0;
const zustand_1 = require("zustand");
const middleware_1 = require("zustand/middleware");
exports.useAuthStore = (0, zustand_1.create)()((0, middleware_1.persist)((set) => ({
    tokens: null,
    user: null,
    hydrated: false,
    setSession: (tokens, user = null) => set({ tokens, user }),
    setUser: (user) => set({ user }),
    clearSession: () => set({ tokens: null, user: null }),
    setHydrated: (hydrated) => set({ hydrated }),
}), {
    name: "olanma-auth",
    storage: (0, middleware_1.createJSONStorage)(() => localStorage),
    partialize: (state) => ({ tokens: state.tokens, user: state.user }),
    onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
    },
}));
