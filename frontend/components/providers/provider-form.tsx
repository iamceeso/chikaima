"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

const providerSchema = z.object({
  name: z.string().min(2),
  provider_type: z.enum(["openai", "anthropic", "gemini", "ollama", "openai_compatible", "local"]),
  base_url: z.string().url().optional().or(z.literal("")),
  api_key: z.string().optional(),
});

type ProviderValues = z.infer<typeof providerSchema>;

export function ProviderForm() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const queryClient = useQueryClient();
  const form = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: "",
      provider_type: "openai",
      base_url: "",
      api_key: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (values: ProviderValues) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.createProvider(token, {
        ...values,
        base_url: values.base_url || undefined,
      });
    },
    onSuccess: async () => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  return (
    <Card className="bg-[var(--surface-raised)]">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Add provider</h2>
        <p className="mt-2 text-sm text-foreground-muted">Connect cloud APIs, local runtimes, or compatible gateways.</p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <div>
          <Label htmlFor="name">
            Name <span className="text-primary">*</span>
          </Label>
          <Input id="name" {...form.register("name")} placeholder="Primary OpenAI" />
        </div>
        <div>
          <Label htmlFor="provider_type">
            Provider type <span className="text-primary">*</span>
          </Label>
          <select
            id="provider_type"
            className="h-11 w-full rounded-xl border border-border bg-[var(--surface-raised)] px-4 text-sm text-foreground"
            {...form.register("provider_type")}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
            <option value="openai_compatible">OpenAI-compatible</option>
            <option value="local">Local model host</option>
          </select>
        </div>
        <div>
          <Label htmlFor="base_url">Base URL</Label>
          <Input id="base_url" {...form.register("base_url")} placeholder="http://localhost:11434" />
        </div>
        <div>
          <Label htmlFor="api_key">API key</Label>
          <Input id="api_key" type="password" {...form.register("api_key")} placeholder="sk-..." />
        </div>
        <div className="rounded-xl border border-border bg-[var(--surface-strong)] p-4 text-xs leading-6 text-foreground-muted">
          OpenAI is wired first for live chat. Add your OpenAI API key here, then pick the synced model from chat.
        </div>
        {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
        <Button type="submit" className="w-full">
          {mutation.isPending ? "Saving..." : "Save provider"}
        </Button>
      </form>
    </Card>
  );
}
