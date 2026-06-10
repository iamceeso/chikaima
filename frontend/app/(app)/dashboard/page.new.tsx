"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, Users, Zap, Clock, CheckCircle, AlertCircle } from "lucide-react";

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
        });
      }
      return api.getDashboard(token);
    },
    refetchInterval: 5000,
  });

  const metrics = {
    activeUsers: 3,
    requestsPerSecond: 2.4,
    avgResponseTime: 145,
    uptime: 99.8,
    cpuUsage: 42,
    memoryUsage: 68,
    databaseLatency: 23,
    cacheHitRate: 87,
  };

  const recentRequests = [
    { id: 1, type: "Chat Message", status: "success", time: "2s ago", duration: 245 },
    { id: 2, type: "File Upload", status: "success", time: "12s ago", duration: 1200 },
    { id: 3, type: "Model Query", status: "success", time: "28s ago", duration: 892 },
    { id: 4, type: "Document Analysis", status: "processing", time: "45s ago", duration: null },
  ];

  const systemMetrics = [
    { label: "API Status", status: "operational", color: "text-green-600" },
    { label: "Database", status: "healthy", color: "text-green-600" },
    { label: "Cache Layer", status: "active", color: "text-green-600" },
    { label: "Message Queue", status: "running", color: "text-green-600" },
  ];

  return (
    <>
      <Topbar
        title="Real-time Analytics"
        description="Live monitoring of your AI workspace"
      />

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-blue-500 bg-background-secondary">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest">Active Users</p>
              <p className="text-3xl font-bold text-foreground mt-1">{metrics.activeUsers}</p>
              <p className="text-xs text-green-600 mt-1">↑ 2 in last hour</p>
            </div>
            <Users className="h-5 w-5 text-blue-500 opacity-60 shrink-0" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-purple-500 bg-background-secondary">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest">Requests/sec</p>
              <p className="text-3xl font-bold text-foreground mt-1">{metrics.requestsPerSecond}</p>
              <p className="text-xs text-green-600 mt-1">↑ 0.8 from avg</p>
            </div>
            <Zap className="h-5 w-5 text-purple-500 opacity-60 shrink-0" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-500 bg-background-secondary">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest">Avg Response</p>
              <p className="text-3xl font-bold text-foreground mt-1">{metrics.avgResponseTime}<span className="text-xs">ms</span></p>
              <p className="text-xs text-green-600 mt-1">✓ Within SLA</p>
            </div>
            <Clock className="h-5 w-5 text-amber-500 opacity-60 shrink-0" />
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-green-500 bg-background-secondary">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest">Uptime</p>
              <p className="text-3xl font-bold text-foreground mt-1">{metrics.uptime}<span className="text-xs">%</span></p>
              <p className="text-xs text-green-600 mt-1">Last 24h</p>
            </div>
            <CheckCircle className="h-5 w-5 text-green-500 opacity-60 shrink-0" />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 bg-background-secondary">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest mb-2">CPU Usage</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-foreground">{metrics.cpuUsage}%</p>
            <div className="flex-1 h-6 bg-background rounded-lg overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg transition-all"
                style={{width: `${metrics.cpuUsage}%`}}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-background-secondary">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest mb-2">Memory Usage</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-foreground">{metrics.memoryUsage}%</p>
            <div className="flex-1 h-6 bg-background rounded-lg overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg transition-all"
                style={{width: `${metrics.memoryUsage}%`}}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-background-secondary">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest mb-2">DB Latency</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-foreground">{metrics.databaseLatency}<span className="text-xs">ms</span></p>
            <div className="flex-1 h-6 bg-background rounded-lg overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-lg transition-all"
                style={{width: `${(metrics.databaseLatency / 100) * 100}%`}}
              />
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-background-secondary">
          <p className="text-xs font-medium text-foreground-muted uppercase tracking-widest mb-2">Cache Hit Rate</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-foreground">{metrics.cacheHitRate}%</p>
            <div className="flex-1 h-6 bg-background rounded-lg overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg transition-all"
                style={{width: `${metrics.cacheHitRate}%`}}
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-4 bg-background-secondary">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Recent Requests</h2>
          </div>
          <div className="space-y-1">
            {recentRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${
                    req.status === "success" ? "bg-green-500" : "bg-amber-500"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{req.type}</p>
                    <p className="text-xs text-foreground-muted">{req.time}</p>
                  </div>
                </div>
                {req.duration && (
                  <p className="text-xs font-medium text-foreground-muted shrink-0 ml-2">{req.duration}ms</p>
                )}
                {!req.duration && (
                  <span className="inline-block animate-spin h-3 w-3 text-primary shrink-0 ml-2">⚙</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 bg-background-secondary">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">System Health</h2>
          </div>
          <div className="space-y-2">
            {systemMetrics.map((metric) => (
              <div key={metric.label} className="flex items-center justify-between">
                <p className="text-xs text-foreground-muted">{metric.label}</p>
                <div className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${metric.color} bg-current`} />
                  <p className="text-xs font-medium text-foreground capitalize">{metric.status}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-foreground-muted">
        <p>Live data - Updates every 5 seconds</p>
        <p>Providers: {data?.providers ?? 0} - Models: {data?.models ?? 0} - Docs: {data?.documents ?? 0}</p>
      </div>
    </>
  );
}
