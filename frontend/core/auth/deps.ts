import { randomUUID } from "node:crypto";

import type { ChikaimaDatabase } from "../db/client.js";
import { settingsTable } from "../db/schema.js";
import { unauthorized, forbidden } from "../errors.js";
import { decodeToken, hashPassword, verifyPassword } from "../security/index.js";
import { UserRepository, type UserRow } from "./repository.js";
import { WorkspaceService } from "./workspaceService.js";

const LEGACY_PUBLIC_WORKSPACE_EMAIL = "workspace-public@chikaima.local";
const PUBLIC_WORKSPACE_EMAIL = "workspace-public@chikaima.app";
const PUBLIC_WORKSPACE_NAME = "Workspace Public";

function adminAuthRequiredError() {
  return unauthorized("Administrator credentials required");
}

function getOrCreatePublicActor(db: ChikaimaDatabase, usersRepo: UserRepository): UserRow {
  let publicUser = usersRepo.getByEmail(PUBLIC_WORKSPACE_EMAIL) ?? usersRepo.getByEmail(LEGACY_PUBLIC_WORKSPACE_EMAIL);

  if (publicUser) {
    if (publicUser.email !== PUBLIC_WORKSPACE_EMAIL || publicUser.fullName !== PUBLIC_WORKSPACE_NAME) {
      publicUser = usersRepo.update(publicUser.id, { email: PUBLIC_WORKSPACE_EMAIL, fullName: PUBLIC_WORKSPACE_NAME });
    }
    return publicUser;
  }

  const now = new Date().toISOString();
  const created: UserRow = {
    id: randomUUID(),
    email: PUBLIC_WORKSPACE_EMAIL,
    fullName: PUBLIC_WORKSPACE_NAME,
    hashedPassword: hashPassword("workspace-public-actor"),
    isActive: true,
    isSuperuser: false,
    createdAt: now,
    updatedAt: now,
  };
  usersRepo.insert(created);
  db.insert(settingsTable)
    .values({ id: randomUUID(), userId: created.id, theme: "dark", defaultModelId: null, preferences: {}, createdAt: now, updatedAt: now })
    .run();
  return created;
}

/** `authorization` is the raw `Authorization` header value (or null), matching FastAPI's `Header(alias="Authorization")` dependency. */
export async function getCurrentUser(db: ChikaimaDatabase, authorization: string | null): Promise<UserRow> {
  const workspace = new WorkspaceService(db).getOrCreate();
  const usersRepo = new UserRepository(db);

  if (!workspace.authenticationEnabled) {
    return getOrCreatePublicActor(db, usersRepo);
  }

  if (!authorization || !authorization.startsWith("Bearer ")) {
    throw unauthorized("Missing bearer token");
  }

  const token = authorization.slice("Bearer ".length).trim();
  let payload;
  try {
    payload = await decodeToken(token, { expectedType: "access" });
  } catch {
    throw unauthorized("Invalid token");
  }

  const user = usersRepo.get(payload.sub);
  if (!user) {
    throw unauthorized("User not found");
  }
  if (!user.isActive) {
    throw forbidden("Inactive user");
  }
  return user;
}

export async function getCurrentAdminUser(db: ChikaimaDatabase, authorization: string | null): Promise<UserRow> {
  const workspace = new WorkspaceService(db).getOrCreate();
  const usersRepo = new UserRepository(db);

  if (workspace.authenticationEnabled) {
    const user = await getCurrentUser(db, authorization);
    if (!user.isSuperuser) {
      throw forbidden("Admin access required");
    }
    return user;
  }

  if (!authorization || !authorization.startsWith("Basic ")) {
    throw adminAuthRequiredError();
  }

  let email: string;
  let password: string;
  try {
    const decoded = Buffer.from(authorization.slice("Basic ".length).trim(), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) throw new Error("malformed basic auth");
    email = decoded.slice(0, separatorIndex);
    password = decoded.slice(separatorIndex + 1);
  } catch {
    throw adminAuthRequiredError();
  }

  const user = usersRepo.getByEmail(email.trim().toLowerCase());
  if (!user || !user.isSuperuser || !user.isActive || !verifyPassword(password, user.hashedPassword)) {
    throw adminAuthRequiredError();
  }

  return user;
}

export function getSettingsOwnerUser(db: ChikaimaDatabase, actor: UserRow): UserRow {
  const workspace = new WorkspaceService(db).getOrCreate();
  if (workspace.authenticationEnabled) {
    return actor;
  }
  return getOrCreatePublicActor(db, new UserRepository(db));
}
