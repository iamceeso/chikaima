import Link from "next/link";
import { MessageSquarePlus, LayoutDashboard, FolderKanban, Settings, UploadCloud } from "lucide-react";

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
    <aside className="w-full rounded-[1.5rem] border border-border bg-[#171717] p-4 xl:w-[280px]">
      <div className="mb-5">
        <p className="text-[11px] uppercase tracking-[0.32em] text-zinc-500">Olanma</p>
        <h2 className="mt-2 font-[family:var(--font-heading)] text-xl font-semibold text-foreground">AI Workspace</h2>
      </div>
      <Link
        href="/chat"
        className="mb-5 flex items-center gap-3 rounded-xl border border-border bg-[#2a2b32] px-4 py-3 text-sm text-foreground transition hover:bg-[#30313a]"
      >
        <MessageSquarePlus className="h-4 w-4" />
        New chat
      </Link>
      <div className="mb-4 px-1 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Workspace</div>
      <nav className="space-y-1.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-[#2a2b32] text-foreground"
                  : "text-zinc-400 hover:bg-[#212226] hover:text-zinc-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 rounded-xl border border-border bg-[#1d1e22] p-4">
        <p className="text-sm font-medium text-foreground">Workspace tips</p>
        <p className="mt-2 text-xs leading-6 text-zinc-400">
          Connect a provider, choose a default model, and keep uploads in one place for a smoother workflow.
        </p>
      </div>
    </aside>
  );
}
