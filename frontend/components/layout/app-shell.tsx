"use client";

import { usePathname } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname === "/chat";

  return (
    <div className="min-h-screen bg-background px-3 py-3 text-foreground sm:px-4">
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1600px] flex-col gap-3 xl:flex-row">
        <Sidebar pathname={pathname} />
        <div
          className={`flex flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-border bg-[#343541] ${
            isChat ? "p-0" : "p-6"
          }`}
        >
          <div className={`flex ${isChat ? "justify-between border-b border-border px-5 py-4" : "mb-6 justify-end"}`}>
            {isChat ? (
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Chat Workspace</p>
                <h1 className="mt-1 text-lg font-medium text-foreground">Unified conversation</h1>
              </div>
            ) : null}
            <ThemeToggle />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
