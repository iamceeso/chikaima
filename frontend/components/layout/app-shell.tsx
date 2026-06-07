"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu, X } from "lucide-react";

import { Sidebar } from "@/components/layout/sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat";
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto flex h-full max-w-420 flex-col gap-0 overflow-hidden xl:flex-row">
        <div className="hidden h-full xl:block xl:shrink-0">
          <Sidebar
            pathname={pathname}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          />
        </div>

        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 bg-foreground/12 backdrop-blur-[2px] xl:hidden dark:bg-black/35" onClick={() => setSidebarOpen(false)}>
            <div className="h-full w-[82vw] max-w-70 p-3" onClick={(event) => event.stopPropagation()}>
              <Sidebar pathname={pathname} mobile onClose={() => setSidebarOpen(false)} />
            </div>
          </div>
        ) : null}

        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden xl:border-l xl:border-border ${
            isChat ? "p-0" : "px-4 py-4 lg:px-6 lg:py-5"
          }`}
        >
          <div
            className={`flex items-center ${isChat ? "justify-start px-4 py-3 sm:px-5" : "mb-2 gap-3 px-1 py-0 sm:hidden"}`}
          >
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground-muted transition hover:text-foreground xl:hidden"
            >
              {sidebarOpen ? <X className="h-4.5 w-4.5" /> : <Menu className="h-4.5 w-4.5" />}
            </button>

            {isChat ? null : (
              <>
                <div className="flex-1" />
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-surface text-foreground-muted transition hover:text-foreground"
                >
                  <Bell className="h-4.5 w-4.5" />
                </button>
              </>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>
    </div>
  );
}
