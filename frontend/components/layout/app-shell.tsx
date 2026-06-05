"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, Search, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col gap-0 xl:flex-row">
        <div className="hidden xl:block">
          <Sidebar
            pathname={pathname}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          />
        </div>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 bg-foreground/12 backdrop-blur-[2px] xl:hidden dark:bg-black/35" onClick={() => setSidebarOpen(false)}>
            <div className="h-full w-[88vw] max-w-[320px] p-3" onClick={(event) => event.stopPropagation()}>
              <Sidebar pathname={pathname} mobile onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        ) : null}

        <div
          className={`flex flex-1 flex-col overflow-hidden xl:border-l xl:border-border ${
            isChat ? "p-0" : "px-4 py-4 lg:px-6 lg:py-5"
          }`}
        >
          <div
            className={`flex items-center ${isChat ? "justify-between border-b border-border px-4 py-4 sm:px-5" : "mb-4 gap-3 px-1 py-1"}`}
          >
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground-muted transition hover:text-foreground xl:hidden"
            >
              {sidebarOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>

            {isChat ? (
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.22em] text-foreground-muted">Chat Workspace</p>
                <h1 className="mt-1 truncate text-lg font-medium text-foreground">Unified conversation</h1>
              </div>
            ) : (
              <>
                <div className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 lg:flex">
                  <Search className="h-4 w-4 text-muted" />
                  <span className="truncate text-sm text-foreground-muted">
                    Search conversations, providers, records, and models
                  </span>
                </div>
                <button
                  type="button"
                  className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-foreground-muted transition hover:text-foreground sm:flex"
                >
                  <Bell className="h-4.5 w-4.5" />
                </button>
              </>
            )}

            <ThemeToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
