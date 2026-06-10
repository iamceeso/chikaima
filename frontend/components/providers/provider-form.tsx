"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFormResolver } from "@/lib/form-resolver";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { ProviderType } from "@/types";

const providerSchema = z.object({
  name: z.string().min(2),
  provider_type: z.enum(["openai", "anthropic", "gemini", "ollama", "openai_compatible", "openrouter", "litellm", "local"]),
  base_url: z.string().url().optional().or(z.literal("")),
  api_key: z.string().optional(),
});

type ProviderValues = z.infer<typeof providerSchema>;

const providerDefaults: Record<ProviderType, { name: string; baseUrl: string; apiKeyPlaceholder: string }> = {
  openai: {
    name: "Primary OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKeyPlaceholder: "sk-...",
  },
  anthropic: {
    name: "Primary Anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeyPlaceholder: "sk-ant-...",
  },
  gemini: {
    name: "Primary Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyPlaceholder: "AIza...",
  },
  ollama: {
    name: "Local Ollama",
    baseUrl: "http://localhost:11434",
    apiKeyPlaceholder: "Not required",
  },
  openai_compatible: {
    name: "Custom gateway",
    baseUrl: "https://your-gateway.example.com/v1",
    apiKeyPlaceholder: "Provider token",
  },
  openrouter: {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyPlaceholder: "sk-or-...",
  },
  litellm: {
    name: "LiteLLM Proxy",
    baseUrl: "http://localhost:4000/v1",
    apiKeyPlaceholder: "Proxy key or master key",
  },
  local: {
    name: "Local model host",
    baseUrl: "http://localhost:4000/v1",
    apiKeyPlaceholder: "Optional",
  },
};

export function ProviderForm() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const queryClient = useQueryClient();
  const form = useForm<ProviderValues>({
    resolver: createFormResolver<ProviderValues>(providerSchema),
    defaultValues: {
      name: "",
      provider_type: "openai",
      base_url: "",
      api_key: "",
    },
  });
  const providerType = useWatch({
    control: form.control,
    name: "provider_type",
  });
  const defaults = providerDefaults[providerType];
  const previousProviderType = useRef<ProviderType>("openai");

  useEffect(() => {
    const previousDefaults = providerDefaults[previousProviderType.current];
    const currentName = form.getValues("name").trim();
    const currentBaseUrl = form.getValues("base_url").trim();

    if (!currentName || currentName === previousDefaults.name) {
      form.setValue("name", defaults.name, { shouldValidate: true, shouldDirty: true });
    }

    if (!currentBaseUrl || currentBaseUrl === previousDefaults.baseUrl) {
      form.setValue("base_url", defaults.baseUrl, { shouldValidate: true, shouldDirty: true });
    }

    form.setValue("api_key", "", { shouldDirty: true });
    previousProviderType.current = providerType;
  }, [defaults.baseUrl, defaults.name, form, providerType]);

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
    <Card className="min-w-0 overflow-hidden bg-surface-raised p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Add provider</h2>
        <p className="mt-2 text-sm text-foreground-muted">
          Connect cloud APIs, local runtimes, or compatible gateways.
        </p>
      </div>
      <form
        className="grid min-w-0 gap-4"
        onSubmit={form.handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <div className="min-w-0">
          <Label htmlFor="name">
            Name <span className="text-primary">*</span>
          </Label>
          <Input id="name" {...form.register("name")} placeholder={defaults.name} />
        </div>
        <div className="min-w-0">
          <Label htmlFor="provider_type">
            Provider type <span className="text-primary">*</span>
          </Label>
          <select
            id="provider_type"
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-surface-raised px-4 text-sm text-foreground"
            {...form.register("provider_type")}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Gemini</option>
            <option value="ollama">Ollama</option>
            <option value="openai_compatible">OpenAI-compatible</option>
            <option value="openrouter">OpenRouter</option>
            <option value="litellm">LiteLLM</option>
            <option value="local">Local model host</option>
          </select>
        </div>
        <div className="min-w-0">
          <Label htmlFor="base_url">Base URL</Label>
          <Input id="base_url" {...form.register("base_url")} placeholder={defaults.baseUrl} />
        </div>
        <div className="min-w-0">
          <Label htmlFor="api_key">API key</Label>
          <Input id="api_key" type="password" {...form.register("api_key")} placeholder={defaults.apiKeyPlaceholder} />
        </div>
       
        {mutation.error ? <p className="text-sm text-primary">{mutation.error.message}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">
          {mutation.isPending ? "Saving..." : "Save provider"}
        </Button>
      </form>
    </Card>
  );
}
