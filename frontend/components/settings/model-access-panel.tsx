"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RefreshCw, Search, Sparkles, Star } from "lucide-react";

import { useAdminAccess } from "@/hooks/use-admin-access";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { AIModel } from "@/types";

export function ModelAccessPanel() {
  const { access, hasAdminAccess } = useAdminAccess();
  const queryClient = useQueryClient();
  const [providerSearch, setProviderSearch] = useState<Record<string, string>>({});
  const [collapsedProviders, setCollapsedProviders] = useState<Record<string, boolean>>({});
  const [resyncingProviderId, setResyncingProviderId] = useState<string | null>(null);

  const workspaceModelsQuery = useQuery({
    queryKey: ["workspace-models"],
    queryFn: () => {
      if (!access) {
        return Promise.reject(new Error("Administrator access is required."));
      }
      return api.getWorkspaceModels(access);
    },
    enabled: Boolean(access),
    staleTime: 5 * 60_000,
  });

  const updateModelVisibility = useMutation({
    mutationFn: async ({
      enabledModelIds,
      defaultModelId,
    }: {
      enabledModelIds: string[];
      defaultModelId?: string | null;
    }) => {
      if (!access) {
        throw new Error("Administrator access is required.");
      }
      return api.updateWorkspaceModels(access, {
        enabled_model_ids: enabledModelIds,
        ...(defaultModelId !== undefined ? { default_model_id: defaultModelId } : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-models"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
  });

  const resyncProviderModels = useMutation({
    mutationFn: async (providerId: string) => {
      if (!access) {
        throw new Error("Administrator access is required.");
      }
      return api.resyncProviderModels(access, providerId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-models"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onSettled: () => {
      setResyncingProviderId(null);
    },
  });

  const modelsByProvider = (workspaceModelsQuery.data ?? []).reduce<
    Array<{ providerId: string; providerName: string; items: AIModel[] }>
  >((groups, model) => {
    const existing = groups.find((group) => group.providerId === model.provider_id);
    if (existing) {
      existing.items.push(model);
      return groups;
    }
    groups.push({
      providerId: model.provider_id,
      providerName: model.provider_name ?? "Provider",
      items: [model],
    });
    return groups;
  }, []);

  const providerSections = useMemo(
    () =>
      modelsByProvider.map((group) => {
        const normalizedSearch = (providerSearch[group.providerId] ?? "").trim().toLowerCase();
        const items = [...group.items]
          .sort((left, right) => {
            const deprecatedDelta = Number(left.is_deprecated) - Number(right.is_deprecated);
            if (deprecatedDelta !== 0) {
              return deprecatedDelta;
            }
            if (left.is_default !== right.is_default) {
              return Number(right.is_default) - Number(left.is_default);
            }
            return left.display_name.localeCompare(right.display_name);
          })
          .filter((model) => {
            if (!normalizedSearch) {
              return true;
            }
            return [model.display_name, model.model_key].join(" ").toLowerCase().includes(normalizedSearch);
          });

        return {
          ...group,
          items,
          enabledCount: group.items.filter((model) => model.is_available).length,
        };
      }),
    [modelsByProvider, providerSearch],
  );

  const toggleModel = (modelId: string, checked: boolean) => {
    const currentModels = workspaceModelsQuery.data ?? [];
    const currentEnabled = new Set(currentModels.filter((model) => model.is_available).map((model) => model.id));
    const targetModel = currentModels.find((model) => model.id === modelId);
    if (checked) {
      currentEnabled.add(modelId);
    } else {
      currentEnabled.delete(modelId);
    }
    updateModelVisibility.mutate({
      enabledModelIds: Array.from(currentEnabled),
      ...(targetModel?.is_default && !checked ? { defaultModelId: null } : {}),
    });
  };

  const setProviderSearchValue = (providerId: string, value: string) => {
    setProviderSearch((current) => ({
      ...current,
      [providerId]: value,
    }));
  };

  const toggleProviderCollapsed = (providerId: string) => {
    setCollapsedProviders((current) => ({
      ...current,
      [providerId]: !current[providerId],
    }));
  };

  const updateProviderModels = (providerId: string, checked: boolean) => {
    const allModels = workspaceModelsQuery.data ?? [];
    const currentEnabled = new Set(allModels.filter((model) => model.is_available).map((model) => model.id));
    const providerModels = allModels.filter((model) => model.provider_id === providerId);
    const normalizedSearch = (providerSearch[providerId] ?? "").trim().toLowerCase();
    const targetModels = providerModels.filter((model) => {
      if (!normalizedSearch) {
        return true;
      }
      return [model.display_name, model.model_key].join(" ").toLowerCase().includes(normalizedSearch);
    });

    for (const model of targetModels) {
      if (checked) {
        currentEnabled.add(model.id);
      } else {
        currentEnabled.delete(model.id);
      }
    }

    updateModelVisibility.mutate({ enabledModelIds: Array.from(currentEnabled) });
  };

  const toggleDefaultModel = (model: AIModel) => {
    const enabledModelIds = (workspaceModelsQuery.data ?? [])
      .filter((item) => item.is_available)
      .map((item) => item.id);
    const enabledSet = new Set(enabledModelIds);
    enabledSet.add(model.id);

    updateModelVisibility.mutate({
      enabledModelIds: Array.from(enabledSet),
      defaultModelId: model.is_default ? null : model.id,
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Available models</p>
          <p className="text-sm text-foreground-muted">
            Choose which synced models can appear across the workspace.
          </p>
        </div>
      </div>

      {!hasAdminAccess ? (
        <div className="rounded-xl border border-dashed border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Admin only.
        </div>
      ) : workspaceModelsQuery.isLoading ? (
        <div className="rounded-xl border border-dashed border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          Loading models...
        </div>
      ) : providerSections.length ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {providerSections.map((group) => {
            const isCollapsed = collapsedProviders[group.providerId] ?? false;
            const visibleCount = group.items.length;
            return (
              <div
                key={group.providerId}
                className={cn(
                  "rounded-xl border border-border bg-background-secondary transition-all",
                  isCollapsed ? "p-2.5" : "p-3",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleProviderCollapsed(group.providerId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 text-left",
                    isCollapsed ? "min-h-0" : "",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{group.providerName}</p>
                    <p className="text-[11px] text-foreground-muted">
                      {group.enabledCount} enabled · {group.items.length} shown
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-foreground-muted transition-transform",
                      isCollapsed ? "-rotate-90" : "rotate-0",
                    )}
                  />
                </button>

                {isCollapsed ? null : (
                  <div className="mt-3 space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                        <Input
                          value={providerSearch[group.providerId] ?? ""}
                          onChange={(event) => setProviderSearchValue(group.providerId, event.target.value)}
                          placeholder={`Search ${group.providerName} models`}
                          className="h-7 rounded-lg bg-background pl-9 pr-3 text-xs"
                        />
                      </div>
                    <div className="flex gap-2">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-7 border border-border px-2.5 text-[11px]"
                          disabled={resyncProviderModels.isPending || updateModelVisibility.isPending}
                          onClick={() => {
                            setResyncingProviderId(group.providerId);
                            resyncProviderModels.mutate(group.providerId);
                          }}
                        >
                          <RefreshCw
                            className={cn(
                              "mr-1 h-3.5 w-3.5",
                              resyncProviderModels.isPending && resyncingProviderId === group.providerId ? "animate-spin" : "",
                            )}
                          />
                          {resyncProviderModels.isPending && resyncingProviderId === group.providerId ? "Resyncing..." : "Resync"}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-7 border border-border px-2.5 text-[11px]"
                          disabled={updateModelVisibility.isPending || resyncProviderModels.isPending || visibleCount === 0}
                          onClick={() => updateProviderModels(group.providerId, true)}
                        >
                          Select all
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          className="h-7 border border-border px-2.5 text-[11px]"
                          disabled={updateModelVisibility.isPending || resyncProviderModels.isPending || visibleCount === 0}
                          onClick={() => updateProviderModels(group.providerId, false)}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>

                    {visibleCount ? (
                      <div className="grid max-h-56 gap-1.5 overflow-y-auto pr-1">
                        {group.items.map((model) => (
                          <div
                            key={model.id}
                            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-background px-3 py-1.5"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm font-medium text-foreground">{model.display_name}</p>
                                {model.is_default ? (
                                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-primary">
                                    Default
                                  </span>
                                ) : null}
                                {model.is_deprecated ? (
                                  <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-foreground-muted">
                                    Deprecated
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-[11px] text-foreground-muted">{model.model_key}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 self-start">
                              <button
                                type="button"
                                aria-label={model.is_default ? "Clear default model" : "Set as default model"}
                                onClick={() => toggleDefaultModel(model)}
                                disabled={updateModelVisibility.isPending}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                                  model.is_default
                                    ? "text-primary hover:bg-primary/10"
                                    : "text-foreground-muted hover:bg-background-secondary hover:text-foreground",
                                )}
                              >
                                <Star className={cn("h-4 w-4", model.is_default ? "fill-current" : "")} />
                              </button>
                              <input
                                type="checkbox"
                                checked={model.is_available}
                                disabled={updateModelVisibility.isPending}
                                onChange={(event) => toggleModel(model.id, event.target.checked)}
                                className="h-4 w-4 cursor-pointer accent-primary"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-foreground-muted">
                        No matching models.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-background-secondary p-4 text-sm text-foreground-muted">
          No synced models yet.
        </div>
      )}

      {updateModelVisibility.error ? (
        <p className="mt-3 text-sm text-primary">{updateModelVisibility.error.message}</p>
      ) : null}
      {resyncProviderModels.error ? (
        <p className="mt-3 text-sm text-primary">{resyncProviderModels.error.message}</p>
      ) : null}
    </Card>
  );
}
