"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFormResolver } from "@/lib/form-resolver";
import { prefetchLibrary } from "@/lib/library";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  full_name: z.string().min(2, "Full name must be at least 2 characters."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

function PasswordField({
  id,
  label,
  required = false,
  hint,
  error,
  registration,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  registration: UseFormRegisterReturn;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>
        {label} {required ? <span className="text-primary">*</span> : null}
      </Label>
      <div className="relative">
        <Input id={id} type={visible ? "text" : "password"} className="pr-10" {...registration} />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-muted transition-colors hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint ? <p className="mt-1 text-xs text-foreground-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-sm text-primary">{error}</p> : null}
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: createFormResolver<z.infer<typeof registerSchema>>(registerSchema),
    mode: "onChange",
  });
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof registerSchema>) => {
      await api.register(values);
      if (workspaceQuery.data?.authentication_enabled === false) {
        return null;
      }
      return api.login({ email: values.email, password: values.password });
    },
    onSuccess: async (tokens) => {
      const next = searchParams.get("next") || "/library";
      router.prefetch(next);

      if (tokens) {
        setSession(tokens);
        const profilePromise = api.getProfile(tokens.access_token).then((user) => {
          setUser(user);
          queryClient.setQueryData(["profile", tokens.access_token], user);
          return user;
        });
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["public-workspace-settings"] }),
          profilePromise,
          prefetchLibrary(queryClient, tokens.access_token),
        ]);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["public-workspace-settings"] });
      }

      router.replace(next);
    },
  });

  return (
    <Card className="w-full max-w-md bg-surface-raised p-4">
      <div className="mb-8">
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Join Chikaima
        </h1>
      </div>
      {workspaceQuery.data?.first_user_registration_required ? (
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div className="rounded-2xl border border-border bg-background-secondary p-4">
            <p className="text-sm font-medium text-foreground">Create the first workspace account</p>
            <p className="mt-2 text-sm text-foreground-muted">
              The first account is the administrator and unlocks the rest of setup.
            </p>
          </div>
          <div>
            <Label htmlFor="full_name">
              Full name <span className="text-primary">*</span>
            </Label>
            <Input id="full_name" {...form.register("full_name")} />
            {form.formState.errors.full_name ? (
              <p className="mt-1 text-sm text-primary">{form.formState.errors.full_name.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="email">
              Email <span className="text-primary">*</span>
            </Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="mt-1 text-sm text-primary">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <PasswordField
            id="password"
            label="Password"
            required
            hint="Must be at least 8 characters."
            error={form.formState.errors.password?.message}
            registration={form.register("password")}
          />
          {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
          <Button type="submit" className="w-full">
            {mutation.isPending ? "Creating..." : "Create admin account"}
          </Button>
        </form>
      ) : workspaceQuery.data?.public_registration_enabled === false ? (
        <div className=" rounded-2xl border border-border bg-background-secondary p-4">
          <p className="text-sm font-medium text-foreground">Public registration is disabled</p>
          <p className="mt-2 text-sm text-foreground-muted">
            Ask a workspace administrator to create your account from Settings.
          </p>
        </div>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div>
            <Label htmlFor="full_name">
              Full name <span className="text-primary">*</span>
            </Label>
            <Input id="full_name" {...form.register("full_name")} />
            {form.formState.errors.full_name ? (
              <p className="mt-1 text-sm text-primary">{form.formState.errors.full_name.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="email">
              Email <span className="text-primary">*</span>
            </Label>
            <Input id="email" type="email" {...form.register("email")} />
            {form.formState.errors.email ? (
              <p className="mt-1 text-sm text-primary">{form.formState.errors.email.message}</p>
            ) : null}
          </div>
          <PasswordField
            id="password"
            label="Password"
            required
            hint="Must be at least 8 characters."
            error={form.formState.errors.password?.message}
            registration={form.register("password")}
          />
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
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const setUser = useAuthStore((state) => state.setUser);
  const workspaceQuery = useQuery({
    queryKey: ["public-workspace-settings"],
    queryFn: () => api.getPublicWorkspaceSettings(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: createFormResolver<z.infer<typeof loginSchema>>(loginSchema),
    mode: "onChange",
  });

  const mutation = useMutation({
    mutationFn: api.login,
    onSuccess: async (tokens) => {
      setSession(tokens);
      const next = searchParams.get("next") || "/library";
      router.prefetch(next);
      const profilePromise = api.getProfile(tokens.access_token).then((user) => {
        setUser(user);
        queryClient.setQueryData(["profile", tokens.access_token], user);
        return user;
      });
      await Promise.allSettled([
        profilePromise,
        prefetchLibrary(queryClient, tokens.access_token),
      ]);
      router.replace(next);
    },
  });

  return (
    <Card className="w-full max-w-md bg-surface-raised p-8">
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">Chikaima</p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm text-foreground-muted">Sign in to manage providers, media jobs, and extracted knowledge.</p>
      </div>
      {workspaceQuery.data?.first_user_registration_required ? (
        <div className="mt-8 rounded-2xl border border-border bg-background-secondary p-4">
          <p className="text-sm font-medium text-foreground">Create the first workspace account first</p>
          <p className="mt-2 text-sm text-foreground-muted">
            Registration is required before anyone can sign in to this workspace.
          </p>
          <Link href="/register" className="mt-4 inline-flex text-sm text-foreground underline decoration-primary/30 underline-offset-4">
            Go to registration
          </Link>
        </div>
      ) : workspaceQuery.data?.authentication_enabled === false ? (
        <div className="mt-8 rounded-2xl border border-border bg-background-secondary p-4">
          <p className="text-sm font-medium text-foreground">Authentication is disabled</p>
          <p className="mt-2 text-sm text-foreground-muted">
            This workspace currently allows direct access without signing in.
          </p>
          <Link href="/library" className="mt-4 inline-flex text-sm text-foreground underline decoration-primary/30 underline-offset-4">
            Open workspace
          </Link>
        </div>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...form.register("email")} />
          </div>
          <PasswordField
            id="password"
            label="Password"
            error={form.formState.errors.password?.message}
            registration={form.register("password")}
          />
          {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
          <Button type="submit" className="w-full">
            {mutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-foreground-muted">
        Need an account?{" "}
        <Link href="/register" className="text-foreground underline decoration-primary/30 underline-offset-4">
          Create one
        </Link>
      </p>
    </Card>
  );
}
