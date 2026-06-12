import assert from "node:assert/strict";
import test from "node:test";

type StorageRecord = Record<string, string>;

class MemoryStorage {
  private store: StorageRecord = {};

  getItem(key: string) {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value;
  }

  removeItem(key: string) {
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

test.afterEach(() => {
  if (originalLocalStorage === undefined) {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test("setSession stores tokens and optional user", async () => {
  const { useAuthStore } = await importAuthStore();

  useAuthStore.getState().setSession(
    {
      access_token: "access",
      refresh_token: "refresh",
      token_type: "bearer",
    },
    {
      id: "user-1",
      email: "user@example.com",
      full_name: "Test User",
      is_active: true,
      is_superuser: false,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    },
  );

  assert.equal(useAuthStore.getState().tokens?.access_token, "access");
  assert.equal(useAuthStore.getState().user?.email, "user@example.com");
});

test("clearSession removes stored auth state", async () => {
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

  assert.equal(useAuthStore.getState().tokens, null);
  assert.equal(useAuthStore.getState().user, null);
});

test("setUser and setHydrated update independent auth store fields", async () => {
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

  assert.equal(useAuthStore.getState().user?.id, "user-2");
  assert.equal(useAuthStore.getState().hydrated, true);
});
