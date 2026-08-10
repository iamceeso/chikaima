import { randomUUID } from "node:crypto";

import type { ChikaimaDatabase } from "../db/client.js";
import { settingsTable } from "../db/schema.js";
import { badRequest, forbidden, unauthorized, notFound, serviceUnavailable } from "../errors.js";
import { getConfig } from "../config/index.js";
import { createAccessToken, createPasswordResetToken, createRefreshToken, decodeToken, hashPassword, verifyPassword } from "../security/index.js";
import { UserRepository, type UserRow } from "./repository.js";
import { WorkspaceService } from "./workspaceService.js";

export interface UserRegisterInput {
  email: string;
  fullName: string;
  password: string;
}

export interface UserAdminCreateInput extends UserRegisterInput {
  isSuperuser: boolean;
  isActive: boolean;
}

export interface UserAdminUpdateInput {
  email?: string;
  fullName?: string;
  password?: string;
  isSuperuser?: boolean;
  isActive?: boolean;
}

export interface UserLoginInput {
  email: string;
  password: string;
}

export class AuthService {
  readonly users: UserRepository;

  constructor(private readonly db: ChikaimaDatabase) {
    this.users = new UserRepository(db);
  }

  register(payload: UserRegisterInput): UserRow {
    if (this.users.getByEmail(payload.email)) {
      throw badRequest("Email already registered");
    }

    const isFirstUser = this.users.count() === 0;
    const workspace = new WorkspaceService(this.db).getOrCreate();
    if (!isFirstUser && !workspace.publicRegistrationEnabled) {
      throw forbidden("Public registration is disabled. Ask an administrator to create your account.");
    }

    return this.createUserRow(payload.email, payload.fullName, payload.password, isFirstUser, true);
  }

  createUser(actor: UserRow, payload: UserAdminCreateInput): UserRow {
    if (!actor.isSuperuser) {
      throw forbidden("Admin access required");
    }
    if (this.users.getByEmail(payload.email)) {
      throw badRequest("Email already registered");
    }
    return this.createUserRow(payload.email, payload.fullName, payload.password, payload.isSuperuser, payload.isActive);
  }

  updateUser(actor: UserRow, userId: string, payload: UserAdminUpdateInput): UserRow {
    if (!actor.isSuperuser) {
      throw forbidden("Admin access required");
    }

    const user = this.users.get(userId);
    if (!user) {
      throw notFound("User not found");
    }

    if (payload.email && payload.email !== user.email && this.users.getByEmail(payload.email)) {
      throw badRequest("Email already registered");
    }

    const nextIsSuperuser = payload.isSuperuser ?? user.isSuperuser;
    const nextIsActive = payload.isActive ?? user.isActive;
    if (user.isSuperuser && !nextIsSuperuser && this.users.countSuperusers() <= 1) {
      throw badRequest("The last admin cannot be changed to a non-admin user.");
    }
    if (user.isSuperuser && !nextIsActive && this.users.countSuperusers() <= 1) {
      throw badRequest("The last admin cannot be made inactive.");
    }

    const patch: Partial<Omit<UserRow, "id">> = {};
    if (payload.email !== undefined) patch.email = payload.email;
    if (payload.fullName !== undefined) patch.fullName = payload.fullName;
    if (payload.password) patch.hashedPassword = hashPassword(payload.password);
    if (payload.isSuperuser !== undefined) patch.isSuperuser = payload.isSuperuser;
    if (payload.isActive !== undefined) patch.isActive = payload.isActive;

    return this.users.update(userId, patch);
  }

  async login(payload: UserLoginInput): Promise<{ user: UserRow; accessToken: string; refreshToken: string }> {
    const workspace = new WorkspaceService(this.db).getOrCreate();
    if (!workspace.authenticationEnabled) {
      throw forbidden("Authentication is disabled for this workspace.");
    }

    const user = this.users.getByEmail(payload.email);
    if (user && !user.isActive) {
      throw forbidden("Your account is inactive");
    }
    if (!user || !verifyPassword(payload.password, user.hashedPassword)) {
      throw unauthorized("Invalid credentials");
    }

    const [accessToken, refreshToken] = await Promise.all([createAccessToken(user.id), createRefreshToken(user.id)]);
    return { user, accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<string> {
    const workspace = new WorkspaceService(this.db).getOrCreate();
    if (!workspace.authenticationEnabled) {
      throw forbidden("Authentication is disabled for this workspace.");
    }

    let payload;
    try {
      payload = await decodeToken(refreshToken, { refresh: true, expectedType: "refresh" });
    } catch {
      throw unauthorized("Invalid refresh token");
    }

    return createAccessToken(payload.sub);
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const config = getConfig();
    if (config.isProduction) {
      throw serviceUnavailable("Password reset is not configured for this deployment.");
    }

    const response = { message: "If the account exists, password reset instructions have been sent." };
    const user = this.users.getByEmail(email);
    if (!user) return response;

    const token = await createPasswordResetToken(user.id);
    console.info(`Password reset token for ${user.email}: ${token}`);

    return response;
  }

  async confirmPasswordReset(payload: { token: string; newPassword: string }): Promise<{ message: string }> {
    let decoded;
    try {
      decoded = await decodeToken(payload.token, { expectedType: "password_reset" });
    } catch {
      throw unauthorized("Invalid reset token");
    }

    const user = this.users.get(decoded.sub);
    if (!user) {
      throw notFound("User not found");
    }

    this.users.update(user.id, { hashedPassword: hashPassword(payload.newPassword) });
    return { message: "Password updated successfully" };
  }

  private createUserRow(email: string, fullName: string, password: string, isSuperuser: boolean, isActive: boolean): UserRow {
    const now = new Date().toISOString();
    const user: UserRow = {
      id: randomUUID(),
      email,
      fullName,
      hashedPassword: hashPassword(password),
      isSuperuser,
      isActive,
      createdAt: now,
      updatedAt: now,
    };
    this.users.insert(user);
    this.db.insert(settingsTable).values({
      id: randomUUID(),
      userId: user.id,
      theme: "dark",
      defaultModelId: null,
      preferences: {},
      createdAt: now,
      updatedAt: now,
    }).run();
    return user;
  }
}
