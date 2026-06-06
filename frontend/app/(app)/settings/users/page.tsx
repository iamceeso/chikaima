"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Trash2, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  password: z.string().min(8),
  is_superuser: z.boolean().default(false),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

export default function SettingsUsersPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      is_superuser: false,
    },
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => {
      if (!token) {
        return Promise.reject(new Error("Please sign in first."));
      }
      return api.getUsers(token);
    },
    enabled: Boolean(token && currentUser?.is_superuser),
  });

  const createMutation = useMutation({
    mutationFn: async (values: CreateUserValues) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.createUser(token, values);
    },
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.deleteUser(token, userId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  if (!currentUser?.is_superuser) {
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

  return (
    <SettingsShell
      title="User management"
      description="Create accounts for teammates, grant admin access, and remove users when needed."
    >
      <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Create user</h2>
              <p className="mt-1 text-sm text-foreground-muted">Admins can add users even when public registration is disabled.</p>
            </div>
          </div>
          <form className="grid gap-4" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" {...form.register("email")} placeholder="teammate@example.com" />
            </div>
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input id="full_name" {...form.register("full_name")} placeholder="New teammate" />
            </div>
            <div>
              <Label htmlFor="password">Temporary password</Label>
              <Input id="password" type="password" {...form.register("password")} placeholder="At least 8 characters" />
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border bg-background-secondary px-4 py-3 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" {...form.register("is_superuser")} />
              Grant administrator access
            </label>
            {createMutation.error ? <p className="text-sm text-primary">{createMutation.error.message}</p> : null}
            <Button type="submit" className="w-full">
              {createMutation.isPending ? "Creating user..." : "Create user"}
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Workspace users</h2>
              <p className="mt-1 text-sm text-foreground-muted">Review who has access and remove accounts that no longer need it.</p>
            </div>
          </div>
          <div className="space-y-3">
            {usersQuery.data?.map((user) => (
              <div key={user.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-background-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{user.full_name}</p>
                  <p className="mt-1 text-sm text-foreground-muted">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-muted">
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {user.is_superuser ? "admin" : "member"}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2.5 py-1">
                      {user.is_active ? "active" : "disabled"}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-center border border-border sm:w-auto"
                  disabled={deleteMutation.isPending || user.id === currentUser.id}
                  onClick={() => deleteMutation.mutate(user.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Remove</span>
                </Button>
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
    </SettingsShell>
  );
}
