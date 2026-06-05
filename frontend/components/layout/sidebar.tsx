import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  FolderKanban,
  LayoutDashboard,
  MessageSquarePlus,
  Settings,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquarePlus },
  { href: "/providers", label: "Providers", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/knowledge", label: "Knowledge", icon: Database },
];

export function Sidebar({
  pathname,
  collapsed = false,
  mobile = false,
  onClose,
  onToggleCollapse,
}: {
  pathname: string;
  collapsed?: boolean;
  mobile?: boolean;
  onClose?: () => void;
  onToggleCollapse?: () => void;
}) {
  return (
    <aside
      className={cn(
        "w-full rounded-[1.75rem] border border-border bg-background-secondary/55 p-3 transition-all xl:p-4",
        collapsed && !mobile ? "xl:w-[96px]" : "xl:w-[312px]",
      )}
    >
      <div
        className={cn(
          "mb-4 flex items-center rounded-2xl px-2 py-1.5",
          collapsed && !mobile ? "justify-center" : "gap-3",
        )}
      >
        {!collapsed || mobile ? (
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none">
            <Sparkles className="h-4.5 w-4.5 text-foreground-muted" />
          </div>
        ) : null}
        {!collapsed || mobile ? (
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted">Olanma</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">Workspace</p>
          </div>
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none">
            <Sparkles className="h-4.5 w-4.5 text-foreground-muted" />
          </div>
        )}
      </div>

      {onToggleCollapse ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            "mb-3 hidden h-10 w-full items-center rounded-2xl px-3 text-sm text-foreground-muted transition hover:bg-surface/70 hover:text-foreground xl:flex",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          {!collapsed ? <span>Collapse menu</span> : null}
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed ? "rotate-180" : "")} />
        </button>
      ) : null}

        <Link
        href="/chat"
        onClick={onClose}
        className={cn(
          "mb-4 flex items-center rounded-2xl bg-surface px-4 py-3 text-sm font-medium text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] transition hover:bg-surface-raised dark:shadow-none",
          collapsed && !mobile ? "justify-center px-0" : "gap-2.5",
        )}
      >
        <MessageSquarePlus className="h-4.5 w-4.5" />
        {!collapsed || mobile ? <span>New chat</span> : null}
      </Link>

      {!collapsed || mobile ? (
        <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Navigate</div>
      ) : null}

      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors duration-150",
                collapsed && !mobile ? "justify-center px-2" : "",
                active
                  ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                  : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl border border-transparent transition-colors",
                  active
                    ? "bg-background-secondary text-foreground dark:bg-surface-strong"
                    : "bg-transparent text-foreground-muted group-hover:text-foreground",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              {!collapsed || mobile ? (
                <div className="flex flex-1 items-center justify-between">
                  <span className={cn("font-medium", active ? "text-foreground" : "")}>{item.label}</span>
                  {active ? <ChevronRight className="h-4 w-4 text-muted" /> : null}
                </div>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed || mobile ? (
        <div className="mt-5 rounded-3xl bg-surface p-4 shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace memory</p>
          <p className="mt-2 text-sm font-medium text-foreground">Shared knowledge stays available across chats.</p>
          <p className="mt-2 text-xs leading-6 text-foreground-muted">
            Keep universal uploads at the workspace level, and let each conversation manage its own files and records.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
