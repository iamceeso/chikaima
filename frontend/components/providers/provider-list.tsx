"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Power, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { Provider } from "@/types";

const providerLabels: Record<Provider["provider_type"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  ollama: "Ollama",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
  local: "Local model host",
};

export function ProviderList() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const queryClient = useQueryClient();
  const [providerPendingDelete, setProviderPendingDelete] = useState<Provider | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getProviders(token);
    },
    staleTime: 5 * 60_000,
  });
  const toggleMutation = useMutation({
    mutationFn: async ({ providerId, isEnabled }: { providerId: string; isEnabled: boolean }) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.updateProvider(token, providerId, { is_enabled: isEnabled });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      return api.deleteProvider(token, providerId);
    },
    onSuccess: async () => {
      setProviderPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-settings"] });
    },
  });

  return (
    <Card className="min-w-0 overflow-hidden bg-surface-raised p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-foreground">Connected providers</h2>
        <p className="mt-1 text-sm text-foreground-muted">Providers available to this workspace.</p>
      </div>
      <div className="space-y-2.5">
        {isLoading ? <p className="text-sm text-foreground-muted">Loading providers...</p> : null}
        {data?.length ? (
          data.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border bg-surface-strong p-3.5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="wrap-break-word font-medium text-foreground">{provider.name}</p>
                  <p className="wrap-break-word text-sm text-foreground-muted">
                    {providerLabels[provider.provider_type]} {provider.base_url ? `- ${provider.base_url}` : ""}
                  </p>
                  {provider.masked_secret ? (
                    <p className="mt-1 text-xs text-muted">Credential {provider.masked_secret}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-stretch gap-2 lg:justify-end">
                  <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground-muted">
                    {provider.is_enabled ? "enabled" : "disabled"}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 min-w-28 border border-border px-3"
                    disabled={toggleMutation.isPending || deleteMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        providerId: provider.id,
                        isEnabled: !provider.is_enabled,
                      })
                    }
                  >
                    <Power className="h-4 w-4" />
                    <span className="ml-2">{provider.is_enabled ? "Disable" : "Enable"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 min-w-28 border border-border px-3"
                    disabled={deleteMutation.isPending || toggleMutation.isPending}
                    onClick={() => setProviderPendingDelete(provider)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="ml-2">Delete</span>
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface-strong-sm text-foreground-muted">
            No providers added yet.
          </div>
        )}
        {toggleMutation.error ? <p className="text-sm text-primary">{toggleMutation.error.message}</p> : null}
        {deleteMutation.error ? <p className="text-sm text-primary">{deleteMutation.error.message}</p> : null}
      </div>

      <AlertDialog
        open={Boolean(providerPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setProviderPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {providerPendingDelete
                ? `This will remove ${providerPendingDelete.name} and its synced models from the workspace.`
                : "This provider will be removed from the workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={deleteMutation.isPending}
              onClick={() => setProviderPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleteMutation.isPending || !providerPendingDelete}
              onClick={() => {
                if (!providerPendingDelete) {
                  return;
                }
                deleteMutation.mutate(providerPendingDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete provider"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
