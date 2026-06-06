"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Cog,
  FolderKanban,
  LayoutDashboard,
  MessageSquarePlus,
  Settings,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import { useChatStore } from "@/store/chat-store";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquarePlus },
  { href: "/library", label: "Library", icon: LayoutDashboard },
  { href: "/processing", label: "Processing", icon: FolderKanban },
];

const settingsItems = [
  { href: "/settings/workspace", label: "Workspace", icon: Cog, adminOnly: false },
  { href: "/settings/users", label: "Users", icon: FolderKanban, adminOnly: true },
  { href: "/settings/providers", label: "Providers", icon: Settings, adminOnly: false },
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
  const token = useAuthStore((state) => state.tokens?.access_token);
  const user = useAuthStore((state) => state.user);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const setActiveConversationId = useChatStore((state) => state.setActiveConversationId);
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getConversations(token);
    },
  });
  const selectedConversationId = activeConversationId ?? conversationsQuery.data?.[0]?.id;
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));

  useEffect(() => {
    setSettingsOpen(pathname.startsWith("/settings"));
  }, [pathname]);

  return (
    <aside
      className={cn(
        "w-full rounded-[1.75rem] border border-border bg-background-secondary/55 p-3 transition-all xl:p-4",
        collapsed && !mobile ? "xl:w-[88px]" : "xl:w-[268px]",
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
            <p className="mt-0.5 text-sm font-medium text-foreground">Media intelligence</p>
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

    
      <nav className="space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                setSettingsOpen(false);
                onClose?.();
              }}
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

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setSettingsOpen((value) => !value)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors duration-150",
              collapsed && !mobile ? "justify-center px-2" : "",
              settingsOpen
                ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-xl border border-transparent transition-colors",
                settingsOpen
                  ? "bg-background-secondary text-foreground dark:bg-surface-strong"
                  : "bg-transparent text-foreground-muted group-hover:text-foreground",
              )}
            >
              <Settings className="h-4.5 w-4.5" />
            </div>
            {!collapsed || mobile ? (
              <div className="flex flex-1 items-center justify-between">
                <span className={cn("font-medium", settingsOpen ? "text-foreground" : "")}>Settings</span>
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", settingsOpen ? "rotate-180" : "")} />
              </div>
            ) : null}
          </button>

          {(!collapsed || mobile) && settingsOpen ? (
            <div className="mt-2 space-y-1 pl-4">
              {settingsItems
                .filter((item) => !item.adminOnly || user?.is_superuser)
                .map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        onClose?.();
                      }}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition-colors duration-150",
                        active
                          ? "bg-background text-foreground"
                          : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          ) : null}
        </div>
      </nav>

      {!collapsed || mobile ? (
        <div className="mt-5 min-h-0 border-t border-border pt-4">
          <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Recent analyses</div>
          <div className="space-y-1">
            {conversationsQuery.data?.map((item) => {
              const active = pathname === "/chat" && selectedConversationId === item.id;
              return (
                <Link
                  key={item.id}
                  href="/chat"
                  onClick={() => {
                    setActiveConversationId(item.id);
                    onClose?.();
                  }}
                  className={cn(
                    "block rounded-2xl px-3 py-2.5 transition-colors duration-150",
                    active
                      ? "bg-surface text-foreground shadow-[0_1px_2px_rgba(20,32,25,0.04)] dark:shadow-none"
                      : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
                  )}
                >
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {item.messages?.at(-1)?.content ?? "No messages yet"}
                  </p>
                </Link>
              );
            })}
            {!conversationsQuery.data?.length ? (
              <div className="rounded-2xl border border-dashed border-border px-3 py-4 text-xs text-foreground-muted">
                No chats yet
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
