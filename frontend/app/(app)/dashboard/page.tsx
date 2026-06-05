"use client";

import { useQuery } from "@tanstack/react-query";

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
      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card className="bg-slate-950/50">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <p className="mt-2 text-sm text-slate-400">
            Chat, provider, and upload activity streams can be extended from the typed API client layer.
          </p>
        </Card>
        <Card className="bg-slate-950/50">
          <h2 className="text-xl font-semibold">Job status</h2>
          <p className="mt-2 text-sm text-slate-400">
            Celery-backed background jobs expose pending, running, completed, and failed states through `/jobs`.
          </p>
        </Card>
      </div>
    </>
  );
}
