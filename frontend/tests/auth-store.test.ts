import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
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
const requireForTests = createRequire(path.resolve(process.cwd(), "package.json"));

async function importAuthStore(initialStorage?: Record<string, string>) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(initialStorage ?? {})) {
    storage.setItem(key, value);
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  const modulePath = path.resolve(process.cwd(), ".test-dist/store/auth-store.js");
  delete requireForTests.cache[requireForTests.resolve(modulePath)];
  const module = requireForTests(modulePath) as {
    useAuthStore: typeof import("../store/auth-store.js").useAuthStore;
  };
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

test("setSession defaults user to null", async () => {
  const { useAuthStore } = await importAuthStore();

  useAuthStore.getState().setSession({
    access_token: "access",
    refresh_token: "refresh",
    token_type: "bearer",
  });

  assert.equal(useAuthStore.getState().user, null);
});

test("rehydrate loads persisted auth state and marks the store hydrated", async () => {
  const { useAuthStore } = await importAuthStore({
    "olanma-auth": JSON.stringify({
      state: {
        tokens: {
          access_token: "persisted-access",
          refresh_token: "persisted-refresh",
          token_type: "bearer",
        },
        user: null,
      },
      version: 0,
    }),
  });

  await useAuthStore.persist.rehydrate();

  assert.equal(useAuthStore.getState().tokens?.access_token, "persisted-access");
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().hydrated, true);
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
