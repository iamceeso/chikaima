import Link from "next/link";
import {
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  MessageSquarePlus,
  Settings,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquarePlus },
  { href: "/uploads", label: "Uploads", icon: UploadCloud },
  { href: "/providers", label: "Providers", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside className="w-full rounded-[1.75rem] border border-border bg-surface p-4 xl:w-[312px] xl:p-5">
      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-border-light bg-[var(--surface-raised)] px-4 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Olanma</p>
          <h2 className="mt-1 font-heading text-base font-semibold text-foreground">Workspace Console</h2>
        </div>
      </div>
      <Link
        href="/chat"
        className="mb-6 flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all duration-150 hover:bg-primary-dark hover:shadow-md"
      >
        <MessageSquarePlus className="h-4.5 w-4.5" />
        <span>New chat</span>
      </Link>
      <div className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Navigation</div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm transition-colors duration-150",
                active
                  ? "bg-[var(--surface-strong)] text-foreground"
                  : "text-foreground-muted hover:bg-[var(--surface-raised)] hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl border border-transparent transition-colors",
                  active
                    ? "bg-surface text-primary shadow-sm"
                    : "bg-[var(--surface-raised)] text-foreground-muted group-hover:text-foreground",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="flex flex-1 items-center justify-between">
                <span className={cn("font-medium", active ? "text-foreground" : "")}>{item.label}</span>
                {active ? <ChevronRight className="h-4 w-4 text-muted" /> : null}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 rounded-2xl border border-border bg-[var(--surface-raised)] p-4">
        <p className="text-sm font-semibold text-foreground">Workspace tip</p>
        <p className="mt-2 text-xs leading-6 text-foreground-muted">
          Connect a provider, set a default model, and use uploads as reusable context so every conversation starts
          closer to the answer.
        </p>
      </div>
    </aside>
  );
}
