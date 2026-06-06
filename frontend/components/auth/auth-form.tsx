"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

const registerSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof registerSchema>) => {
      await api.register(values);
      return api.login({ email: values.email, password: values.password });
    },
    onSuccess: (tokens) => {
      setSession(tokens);
      router.replace(searchParams.get("next") || "/library");
    },
  });

  return (
    <Card className="w-full max-w-md bg-[var(--surface-raised)] p-8">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Olanma</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Join {workspaceQuery.data?.name ?? "your workspace"}
        </h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Set up Olanma and start processing audio, video, and documents.
        </p>
      </div>
      {workspaceQuery.data?.public_registration_enabled === false ? (
        <div className="mt-8 rounded-2xl border border-border bg-background-secondary p-4">
          <p className="text-sm font-medium text-foreground">Public registration is disabled</p>
          <p className="mt-2 text-sm text-foreground-muted">
            Ask a workspace administrator to create your account from Settings.
          </p>
        </div>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div>
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" {...form.register("full_name")} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...form.register("password")} />
          </div>
          {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
          <Button type="submit" className="w-full">
            {mutation.isPending ? "Creating..." : "Create account"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-foreground-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline decoration-primary/30 underline-offset-4">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: (tokens) => {
      setSession(tokens);
      router.replace(searchParams.get("next") || "/library");
    },
  });

  return (
    <Card className="w-full max-w-md bg-[var(--surface-raised)] p-8">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Olanma</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm text-foreground-muted">Sign in to manage providers, media jobs, and extracted knowledge.</p>
      </div>
      <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" {...form.register("password")} />
        </div>
        {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
        <Button type="submit" className="w-full">
          {mutation.isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-foreground-muted">
        Need an account?{" "}
        <Link href="/register" className="text-foreground underline decoration-primary/30 underline-offset-4">
          Create one
        </Link>
      </p>
    </Card>
  );
}
