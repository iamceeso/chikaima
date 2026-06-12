"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
class MemoryStorage {
    store = {};
    getItem(key) {
        return this.store[key] ?? null;
    }
    setItem(key, value) {
        this.store[key] = value;
    }
    removeItem(key) {
        delete this.store[key];
    }
    clear() {
        this.store = {};
    }
}
const originalLocalStorage = global.localStorage;
async function importAuthStore() {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: storage,
    });
    const module = await import(`../store/auth-store.js?case=${Math.random()}`);
    return { storage, useAuthStore: module.useAuthStore };
}
node_test_1.default.afterEach(() => {
    if (originalLocalStorage === undefined) {
        delete globalThis.localStorage;
    }
    else {
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            value: originalLocalStorage,
        });
    }
});
(0, node_test_1.default)("setSession stores tokens and optional user", async () => {
    const { useAuthStore } = await importAuthStore();
    useAuthStore.getState().setSession({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "bearer",
    }, {
        id: "user-1",
        email: "user@example.com",
        full_name: "Test User",
        is_active: true,
        is_superuser: false,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
    });
    strict_1.default.equal(useAuthStore.getState().tokens?.access_token, "access");
    strict_1.default.equal(useAuthStore.getState().user?.email, "user@example.com");
});
(0, node_test_1.default)("clearSession removes stored auth state", async () => {
    const { useAuthStore } = await importAuthStore();
    useAuthStore.setState({
        tokens: {
            access_token: "access",
            refresh_token: "refresh",
            token_type: "bearer",
        },
        user: {
            id: "user-1",
            email: "user@example.com",
            full_name: "Test User",
            is_active: true,
            is_superuser: false,
            created_at: "2026-01-01",
            updated_at: "2026-01-01",
        },
        hydrated: false,
    });
    useAuthStore.getState().clearSession();
    strict_1.default.equal(useAuthStore.getState().tokens, null);
    strict_1.default.equal(useAuthStore.getState().user, null);
});
(0, node_test_1.default)("setUser and setHydrated update independent auth store fields", async () => {
    const { useAuthStore } = await importAuthStore();
    useAuthStore.getState().setUser({
        id: "user-2",
        email: "admin@example.com",
        full_name: "Admin User",
        is_active: true,
        is_superuser: true,
        created_at: "2026-01-02",
        updated_at: "2026-01-02",
    });
    useAuthStore.getState().setHydrated(true);
    strict_1.default.equal(useAuthStore.getState().user?.id, "user-2");
    strict_1.default.equal(useAuthStore.getState().hydrated, true);
});
