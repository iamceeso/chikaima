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
    <Card className="bg-slate-950/50">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Connected providers</h2>
        <p className="mt-2 text-sm text-slate-400">Providers and local runtimes available to the workspace.</p>
      </div>
      <div className="space-y-3">
        {isLoading ? <p className="text-sm text-slate-400">Loading providers...</p> : null}
        {data?.length ? (
          data.map((provider) => (
            <div key={provider.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{provider.name}</p>
                  <p className="text-sm text-slate-400">
                    {provider.provider_type} {provider.base_url ? `• ${provider.base_url}` : ""}
                  </p>
                </div>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.22em] text-cyan-200">
                  {provider.is_enabled ? "enabled" : "disabled"}
                </span>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-400">No providers added yet.</p>
        )}
      </div>
    </Card>
  );
}
