"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  FolderKanban,
  ShieldCheck,
  UploadCloud,
  Video,
} from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function DashboardPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve({
          providers: 0,
          models: 0,
          documents: 0,
          videos: 0,
          jobs: 0,
          system_health: "ready",
        });
      }
      return api.getDashboard(token);
    },
  });

  const summaryCards = [
    {
      label: "Providers",
      value: data?.providers ?? 0,
      helper: "Cloud APIs and local runtimes connected to Olanma.",
      trend: "Ready",
    },
    {
      label: "Models",
      value: data?.models ?? 0,
      helper: "Dynamic models available for chat and analysis flows.",
      trend: "Synced",
    },
    {
      label: "Documents",
      value: data?.documents ?? 0,
      helper: "Knowledge assets uploaded for summarization and Q&A.",
      trend: "Indexed",
    },
    {
      label: "Videos",
      value: data?.videos ?? 0,
      helper: "Media assets staged for background processing.",
      trend: "Queued",
    },
  ];

  const workspaceModules = [
    {
      title: "Chat workspace",
      description: "Multi-provider conversations with editable prompts and model switching.",
      icon: Bot,
    },
    {
      title: "Provider registry",
      description: "Manage OpenAI, Anthropic, Gemini, Ollama, and custom endpoints in one place.",
      icon: FolderKanban,
    },
    {
      title: "Upload center",
      description: "Send documents, audio, and video into background analysis workflows.",
      icon: UploadCloud,
    },
  ];

  const operationalFeed = [
    {
      title: "System health",
      detail: `Backend is reporting ${data?.system_health ?? "ready"} status across the workspace.`,
      icon: ShieldCheck,
    },
    {
      title: "Document analysis",
      detail: `${data?.documents ?? 0} document assets are available for summarization and extraction.`,
      icon: FileText,
    },
    {
      title: "Video jobs",
      detail: `${data?.videos ?? 0} video assets are prepared for transcription and chapter generation.`,
      icon: Video,
    },
    {
      title: "Background queue",
      detail: `${data?.jobs ?? 0} tracked jobs are visible from settings and operations panels.`,
      icon: Clock3,
    },
  ];

  return (
    <>
      <Topbar title="Workspace overview" description="A calmer operations home for your models, uploads, and AI workflows." />

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[1.75rem] bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Operations</p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">Everything important in one place</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-foreground-muted">
                Monitor connected providers, available models, background analysis work, and the overall readiness of
                the Olanma workspace without jumping between pages.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Current state</p>
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-success" />
                {data?.system_health ?? "ready"}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                helper={card.helper}
                trend={card.trend}
              />
            ))}
          </div>
        </Card>

        <Card className="rounded-[1.75rem] bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Readiness</p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">Workspace modules</h2>
            </div>
            <ArrowUpRight className="h-5 w-5 text-muted" />
          </div>
          <div className="mt-5 space-y-3">
            {workspaceModules.map((module) => {
              const Icon = module.icon;
              return (
                <div key={module.title} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{module.title}</p>
                      <p className="mt-1 text-sm leading-6 text-foreground-muted">{module.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[1.75rem] bg-surface p-6">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Operational feed</h2>
              <p className="mt-1 text-sm text-foreground-muted">Live workspace context shaped for daily use.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {operationalFeed.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-foreground-muted">{item.detail}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="rounded-[1.75rem] bg-surface p-6">
            <h2 className="text-xl font-semibold text-foreground">Quick summary</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Providers</p>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">
                  {data?.providers ?? 0} providers connected and ready to supply models.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Models</p>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">
                  {data?.models ?? 0} models are currently available for chat and analysis.
                </p>
              </div>
            </div>
          </Card>

          <Card className="rounded-[1.75rem] bg-surface p-6">
            <h2 className="text-xl font-semibold text-foreground">Workspace health</h2>
            <div className="mt-5 space-y-3">
              {[
                { label: "API layer", value: "Operational" },
                { label: "PostgreSQL", value: "Healthy" },
                { label: "Redis / queue", value: "Running" },
                { label: "Provider sync", value: "Ready" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
                  <p className="text-sm text-foreground-muted">{row.label}</p>
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-border bg-background px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <Clock3 className="h-4 w-4" />
          Workspace overview updates from live backend state when authenticated.
        </div>
        <div className="text-sm font-medium text-foreground">
          Providers {data?.providers ?? 0} • Models {data?.models ?? 0} • Docs {data?.documents ?? 0}
        </div>
      </div>
    </>
  );
}
