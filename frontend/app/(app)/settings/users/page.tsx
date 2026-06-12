"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Shield, Trash2, UserPlus, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { AdminAccessGate } from "@/components/settings/admin-access-gate";
import { useAdminAccess } from "@/hooks/use-admin-access";
import { SettingsShell } from "@/components/settings/settings-shell";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFormResolver } from "@/lib/form-resolver";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { User } from "@/types";

const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  password: z.string().min(8),
  is_superuser: z.boolean().default(false),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

const updateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  password: z.string().optional(),
  is_superuser: z.boolean().default(false),
  is_active: z.boolean().default(true),
});

type UpdateUserValues = z.infer<typeof updateUserSchema>;

export default function SettingsUsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const { access, hasAdminAccess, publicWorkspaceQuery, workspaceAuthDisabled } = useAdminAccess();
  const queryClient = useQueryClient();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userPendingDelete, setUserPendingDelete] = useState<User | null>(null);
  const form = useForm<CreateUserValues>({
    resolver: createFormResolver<CreateUserValues>(createUserSchema),
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      is_superuser: false,
    },
  });
  const editForm = useForm<UpdateUserValues>({
    resolver: createFormResolver<UpdateUserValues>(updateUserSchema),
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      is_superuser: false,
      is_active: true,
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => {
      if (!access) {
        return Promise.reject(new Error("Administrator access is required."));
      }
      return api.getUsers(access);
    },
    enabled: Boolean(access),
  });
  const createMutation = useMutation({
    mutationFn: async (values: CreateUserValues) => {
      if (!access) {
        throw new Error("Administrator access is required.");
      }
      return api.createUser(access, values);
    },
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!access) {
        throw new Error("Administrator access is required.");
      }
      return api.deleteUser(access, userId);
    },
    onSuccess: async () => {
      setUserPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: async (values: UpdateUserValues) => {
      if (!access || !editingUserId) {
        throw new Error("Select a user first.");
      }
      return api.updateUser(access, editingUserId, {
        email: values.email,
        full_name: values.full_name,
        password: values.password || undefined,
        is_superuser: values.is_superuser,
        is_active: values.is_active,
      });
    },
    onSuccess: async () => {
      setEditingUserId(null);
      editForm.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  if (publicWorkspaceQuery.isLoading) {
    return (
      <SettingsShell
        title="User management"
        description="Manage access."
      >
        <Card className="p-6">
          <p className="text-sm text-foreground-muted">Loading workspace access...</p>
        </Card>
      </SettingsShell>
    );
  }

  if (workspaceAuthDisabled && !hasAdminAccess) {
    return (
      <SettingsShell
        title="User management"
        description="Manage access."
      >
        <AdminAccessGate
          title="Admin credentials required"
          description="Workspace sign-in is disabled, so viewing or changing users requires an existing administrator email and password."
        />
      </SettingsShell>
    );
  }

  if (!hasAdminAccess) {
    return (
      <SettingsShell
        title="User management"
        description="Only workspace administrators can create or remove users."
      >
        <Card className="p-6">
          <p className="text-sm text-foreground-muted">You need an admin account to manage workspace users.</p>
        </Card>
      </SettingsShell>
    );
  }

  const adminCount = usersQuery.data?.filter((user) => user.is_superuser).length ?? 0;
  const editingUser = usersQuery.data?.find((user) => user.id === editingUserId) ?? null;
  const editingLastAdmin = Boolean(editingUser?.is_superuser && adminCount <= 1);

  return (
    <SettingsShell
      title="User management"
      description="Manage access."
    >
      <div className="grid gap-4 xl:grid-cols-[0.88fr_1.12fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Create user</h2>
              <p className="mt-1 text-sm text-foreground-muted">Admins can add users directly.</p>
            </div>
          </div>
          <form className="grid gap-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
            <div>
              <Label htmlFor="email">
                Email <span className="text-primary">*</span>
              </Label>
              <Input id="email" {...form.register("email")} placeholder="teammate@example.com" />
            </div>
            <div>
              <Label htmlFor="full_name">
                Full name <span className="text-primary">*</span>
              </Label>
              <Input id="full_name" {...form.register("full_name")} placeholder="New teammate" />
            </div>
            <div>
              <Label htmlFor="password">
                Temporary password <span className="text-primary">*</span>
              </Label>
              <Input id="password" type="password" {...form.register("password")} placeholder="At least 8 characters" />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" {...form.register("is_superuser")} />
              Grant administrator access
            </label>
            {createMutation.error ? <p className="text-sm text-primary">{createMutation.error.message}</p> : null}
            <Button type="submit" className="w-full">
              {createMutation.isPending ? "Creating user..." : "Create user"}
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Workspace users</h2>
              <p className="mt-1 text-sm text-foreground-muted">Edit, disable, or remove users.</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {usersQuery.data?.map((user) => (
              <div key={user.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background-secondary p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{user.full_name}</p>
                  <p className="mt-0.5 text-sm text-foreground-muted">{user.email}</p>
                  <div className="mt-1.5 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {user.is_superuser ? "admin" : "member"}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {user.is_active ? "active" : "disabled"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-center border border-border sm:w-auto"
                    onClick={() => {
                      setEditingUserId(user.id);
                      editForm.reset({
                        email: user.email,
                        full_name: user.full_name,
                        password: "",
                        is_superuser: user.is_superuser,
                        is_active: user.is_active,
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="ml-2">Edit</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-center border border-border sm:w-auto"
                    disabled={
                      deleteMutation.isPending ||
                      user.id === currentUser?.id ||
                      (user.is_superuser && adminCount <= 1)
                    }
                    onClick={() => setUserPendingDelete(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-2">Remove</span>
                  </Button>
                </div>
              </div>
            ))}
            {!usersQuery.data?.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-background-secondary p-4 text-sm text-foreground-muted">
                No users found.
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {editingUserId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
          onClick={() => {
            setEditingUserId(null);
            editForm.reset();
          }}
        >
          <Card
            className="w-full max-w-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Edit user</h2>
                <p className="mt-1 text-sm text-foreground-muted">{editingUser?.email}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-10 border border-border p-0"
                onClick={() => {
                  setEditingUserId(null);
                  editForm.reset();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={editForm.handleSubmit((values) => updateMutation.mutate(values))}>
              <div>
                <Label htmlFor="edit_email">
                  Email <span className="text-primary">*</span>
                </Label>
                <Input id="edit_email" {...editForm.register("email")} />
              </div>
              <div>
                <Label htmlFor="edit_full_name">
                  Full name <span className="text-primary">*</span>
                </Label>
                <Input id="edit_full_name" {...editForm.register("full_name")} />
              </div>
              <div>
                <Label htmlFor="edit_password">New password</Label>
                <Input id="edit_password" type="password" {...editForm.register("password")} placeholder="Leave blank to keep current password" />
              </div>
              <div className="grid gap-2">
                <label className="flex items-center gap-3 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    disabled={editingLastAdmin}
                    {...editForm.register("is_superuser")}
                  />
                  Administrator
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    disabled={editingLastAdmin}
                    {...editForm.register("is_active")}
                  />
                  Active user
                </label>
              </div>
              {updateMutation.error ? <p className="text-sm text-primary md:col-span-2">{updateMutation.error.message}</p> : null}
              {editingLastAdmin ? (
                <p className="text-sm text-foreground-muted md:col-span-2">
                  The last admin cannot be made inactive or changed to a non-admin user.
                </p>
              ) : null}
              <div className="flex gap-3 pt-1 md:col-span-2">
                <Button type="submit">
                  {updateMutation.isPending ? "Saving..." : "Save changes"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="border border-border"
                  onClick={() => {
                    setEditingUserId(null);
                    editForm.reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(userPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setUserPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove user?</AlertDialogTitle>
            <AlertDialogDescription>
              {userPendingDelete
                ? `This will remove ${userPendingDelete.full_name} (${userPendingDelete.email}) from the workspace.`
                : "This user will be removed from the workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={deleteMutation.isPending}
              onClick={() => setUserPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleteMutation.isPending || !userPendingDelete}
              onClick={() => {
                if (!userPendingDelete) {
                  return;
                }
                deleteMutation.mutate(userPendingDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Removing..." : "Remove user"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsShell>
  );
}
