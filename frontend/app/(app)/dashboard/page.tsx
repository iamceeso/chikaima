"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, FolderClock, HardDriveUpload, ShieldCheck, Sparkles } from "lucide-react";

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
          system_health: "connect account",
        });
      }
      return api.getDashboard(token);
    },
  });

  const quickActions = [
    { label: "Start a chat", helper: "Launch a new model conversation", icon: Sparkles },
    { label: "Add provider", helper: "Connect a hosted or local endpoint", icon: ShieldCheck },
    { label: "Upload content", helper: "Queue document, audio, or video analysis", icon: HardDriveUpload },
  ];

  return (
    <>
      <Topbar
        title="Operations dashboard"
        description="Track provider readiness, workspace activity, and ingestion jobs across your AI stack."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Providers" value={data?.providers ?? 0} helper="Connected APIs and runtimes" />
        <StatCard label="Models" value={data?.models ?? 0} helper="Dynamic models available in chat" />
        <StatCard label="Documents" value={data?.documents ?? 0} helper="Uploaded analysis assets" />
        <StatCard label="Videos" value={data?.videos ?? 0} helper="Queued and processed media" />
        <StatCard label="Health" value={data?.system_health ?? "n/a"} helper="Runtime health snapshot" />
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-[#40414f]">
          <div className="mb-5 flex items-center gap-3">
            <Activity className="h-5 w-5 text-zinc-300" />
            <div>
              <h2 className="text-xl font-semibold text-foreground">Recent activity</h2>
              <p className="mt-1 text-sm text-zinc-400">A focused snapshot of what changed in the workspace.</p>
            </div>
          </div>
          <div className="space-y-3">
            {[
              "Provider sync surface is ready for dynamic model refresh.",
              "Document, audio, and video routes are scaffolded for background jobs.",
              "Chat UI is prepared for streaming and message regeneration flows.",
            ].map((item) => (
              <div key={item} className="rounded-xl border border-border bg-[#343541] p-4 text-sm text-zinc-300">
                {item}
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4">
          <Card className="bg-[#40414f]">
            <div className="mb-4 flex items-center gap-3">
              <FolderClock className="h-5 w-5 text-zinc-300" />
              <h2 className="text-xl font-semibold text-foreground">Quick actions</h2>
            </div>
            <div className="space-y-3">
              {quickActions.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex gap-3 rounded-xl border border-border bg-[#343541] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#202123]">
                      <Icon className="h-4 w-4 text-zinc-300" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-1 text-sm text-zinc-400">{item.helper}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="bg-[#40414f]">
            <h2 className="text-xl font-semibold text-foreground">System status</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Celery-backed background jobs expose pending, running, completed, and failed states through `/jobs`.
              Provider health, queue depth, and sync timing can be layered onto this panel next.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
