"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat";

  return (
    <div className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1680px] flex-col gap-3 xl:flex-row">
        <Sidebar pathname={pathname} />
        <div
          className={`flex flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-border bg-[var(--surface-raised)] ${
            isChat ? "p-0" : "p-4 lg:p-5"
          }`}
        >
          <div
            className={`flex items-center ${isChat ? "justify-between border-b border-border px-5 py-4" : "mb-4 gap-3 px-1 py-1"}`}
          >
            {isChat ? (
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-foreground-muted">Chat Workspace</p>
                <h1 className="mt-1 text-lg font-medium text-foreground">Unified conversation</h1>
              </div>
            ) : (
              <>
                <div className="hidden min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 lg:flex">
                  <Search className="h-4 w-4 text-muted" />
                  <span className="truncate text-sm text-foreground-muted">
                    Search conversations, providers, jobs, and uploads
                  </span>
                </div>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-background text-foreground-muted transition hover:text-foreground"
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
