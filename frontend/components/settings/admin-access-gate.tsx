"use client";

import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { buildBasicAuthHeader } from "@/lib/admin-auth";
import { createFormResolver } from "@/lib/form-resolver";
import { api } from "@/services/api";
import { useAdminAuthStore } from "@/store/admin-auth-store";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const adminAccessSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required."),
});

type AdminAccessValues = z.infer<typeof adminAccessSchema>;

export function AdminAccessGate({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const savedEmail = useAdminAuthStore((state) => state.email);
  const setCredentials = useAdminAuthStore((state) => state.setCredentials);
  const form = useForm<AdminAccessValues>({
    resolver: createFormResolver<AdminAccessValues>(adminAccessSchema),
    defaultValues: {
      email: savedEmail,
      password: "",
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (values: AdminAccessValues) => {
      const authHeader = buildBasicAuthHeader(values.email, values.password);
      await api.getWorkspaceSettings({ authHeader });
      setCredentials(values.email.trim(), values.password);
    },
  });

  return (
    <Card className="p-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-foreground-muted">{description}</p>
      <form className="mt-5 grid gap-3" onSubmit={form.handleSubmit((values) => verifyMutation.mutate(values))}>
        <div>
          <Label htmlFor="admin_email">
            Admin email <span className="text-primary">*</span>
          </Label>
          <Input id="admin_email" type="email" {...form.register("email")} placeholder="admin@example.com" />
          {form.formState.errors.email ? <p className="mt-1 text-sm text-primary">{form.formState.errors.email.message}</p> : null}
        </div>
        <div>
          <Label htmlFor="admin_password">
            Admin password <span className="text-primary">*</span>
          </Label>
          <Input id="admin_password" type="password" {...form.register("password")} placeholder="Enter the admin password" />
          {form.formState.errors.password ? <p className="mt-1 text-sm text-primary">{form.formState.errors.password.message}</p> : null}
        </div>
        {verifyMutation.error ? <p className="text-sm text-primary">{verifyMutation.error.message}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">
          {verifyMutation.isPending ? "Verifying..." : "Unlock admin controls"}
        </Button>
      </form>
    </Card>
  );
}
