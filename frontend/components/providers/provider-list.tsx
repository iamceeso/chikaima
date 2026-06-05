"use client";

import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export function ProviderList() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const { data, isLoading } = useQuery({
    queryKey: ["providers"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getProviders(token);
    },
  });

  return (
    <Card className="bg-[var(--surface-raised)]">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Connected providers</h2>
        <p className="mt-2 text-sm text-foreground-muted">Providers and local runtimes available to the workspace.</p>
      </div>
      <div className="space-y-3">
        {isLoading ? <p className="text-sm text-foreground-muted">Loading providers...</p> : null}
        {data?.length ? (
          data.map((provider) => (
            <div key={provider.id} className="rounded-xl border border-border bg-[var(--surface-strong)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">{provider.name}</p>
                  <p className="text-sm text-foreground-muted">
                    {provider.provider_type} {provider.base_url ? `• ${provider.base_url}` : ""}
                  </p>
                  {provider.masked_secret ? (
                    <p className="mt-1 text-xs text-muted">Credential {provider.masked_secret}</p>
                  ) : null}
                </div>
                <span className="rounded-full border border-border bg-[var(--surface-raised)] px-3 py-1 text-xs uppercase tracking-[0.18em] text-foreground-muted">
                  {provider.is_enabled ? "enabled" : "disabled"}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-[var(--surface-strong)] p-4 text-sm text-foreground-muted">
            No providers added yet.
          </div>
        )}
      </div>
    </Card>
  );
}
