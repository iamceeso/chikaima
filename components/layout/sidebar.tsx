"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Cog,
  FolderGit2,
  FolderKanban,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

import { useAdminAccess } from "@/hooks/use-admin-access";
import { useLastProject } from "@/lib/last-project";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

const settingsItems = [
  { href: "/settings/providers", label: "Providers", icon: Settings, adminOnly: false },
  { href: "/settings/models", label: "Models", icon: Sparkles, adminOnly: false },
  { href: "/settings/workspace", label: "General", icon: Cog, adminOnly: false },
  { href: "/settings/users", label: "Users", icon: Users, adminOnly: true },
];

/** The previous media/document tools. Still available; no longer the product's headline. */
const classicItems = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/library", label: "Library", icon: LayoutDashboard },
  { href: "/processing", label: "Processing", icon: FolderKanban },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  disabled,
  hint,
  onClick,
}: {
  href: string;
  label: string;
  icon: typeof Code2;
  active: boolean;
  collapsed: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  const className = cn(
    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[12.5px] transition-colors",
    collapsed && "justify-center px-1.5",
    active ? "bg-surface text-foreground" : "text-foreground-muted hover:bg-surface/70 hover:text-foreground",
    disabled && "pointer-events-none opacity-45",
  );
  const body = (
    <>
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      {collapsed ? null : <span className="truncate font-medium">{label}</span>}
    </>
  );
  return (
    <Link href={href} onClick={onClick} className={className} title={collapsed ? label : hint} aria-current={active ? "page" : undefined}>
      {body}
    </Link>
  );
}

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
  const { access, hasAdminAccess } = useAdminAccess();
  const lastProject = useLastProject();
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"));
  const [classicOpen, setClassicOpen] = useState(classicItems.some((item) => pathname.startsWith(item.href)));
  const narrow = collapsed && !mobile;

  const projectsQuery = useQuery({
    queryKey: ["collab-projects"],
    queryFn: () => api.getProjects(access!),
    enabled: Boolean(access),
    staleTime: 30_000,
  });
  const projects = projectsQuery.data ?? [];
  const current = projects.find((project) => project.id === lastProject) ?? null;
  const base = current ? `/projects/${current.id}` : null;

  const primary = [
    { href: "/projects", label: "Projects", icon: FolderGit2, active: pathname === "/projects" || pathname === "/projects/new" },
    { href: base ?? "/projects", label: "Workspace", icon: Code2, active: Boolean(base) && pathname === base, disabled: !base },
    { href: base ? `${base}/team` : "/projects", label: "AI Team", icon: Users, active: Boolean(base) && pathname === `${base}/team`, disabled: !base },
    { href: base ? `${base}/tasks` : "/projects", label: "Tasks", icon: KanbanSquare, active: Boolean(base) && pathname === `${base}/tasks`, disabled: !base },
  ];

  return (
    <aside className={cn("flex h-full w-full flex-col border-r border-border bg-background-secondary/55 p-2.5 transition-all xl:h-screen", narrow ? "xl:w-16" : "xl:w-60")}>
      <div className={cn("mb-3 flex items-center px-1.5 py-1", narrow ? "justify-center" : "gap-2")}>
        <Link href="/projects" className="flex min-w-0 flex-1 items-center gap-2" onClick={onClose}>
          <Image src="/chikaima-logo.png" alt="Chikaima logo" width={24} height={24} className="h-6 w-6 shrink-0 object-contain" priority />
          {narrow ? null : <span className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground">Chikaima</span>}
        </Link>
        {onToggleCollapse && !narrow ? (
          <button type="button" onClick={onToggleCollapse} className="hidden h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-surface hover:text-foreground xl:flex" aria-label="Collapse menu">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {onToggleCollapse && narrow ? (
        <button type="button" onClick={onToggleCollapse} className="mx-auto mb-2 hidden h-7 w-7 items-center justify-center rounded-md text-foreground-muted hover:bg-surface hover:text-foreground xl:flex" aria-label="Expand menu">
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : null}

      <nav className="space-y-0.5" aria-label="Primary">
        {primary.map((item) => (
          <NavLink key={item.label} {...item} collapsed={narrow} hint={item.disabled ? "Open a project first" : current ? `${item.label} · ${current.name}` : undefined} onClick={onClose} />
        ))}
      </nav>

      {!narrow && current ? <p className="mt-1.5 truncate px-2 text-[11px] text-muted">Current project: {current.name}</p> : null}

      <div className="mt-4 space-y-0.5">
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-foreground-muted hover:bg-surface/70 hover:text-foreground", narrow && "justify-center px-1.5")}
          aria-expanded={settingsOpen}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {narrow ? null : (
            <>
              <span className="flex-1 font-medium">Settings</span>
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", settingsOpen && "rotate-180")} />
            </>
          )}
        </button>
        {settingsOpen && !narrow ? (
          <div className="space-y-0.5 pl-4">
            {settingsItems
              .filter((item) => !item.adminOnly || hasAdminAccess)
              .map((item) => (
                <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={pathname === item.href} collapsed={false} onClick={onClose} />
              ))}
          </div>
        ) : null}
      </div>

      {!narrow ? (
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-border pt-3">
          <p className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted">Recent projects</p>
          {projects.slice(0, 8).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-surface/70",
                pathname.startsWith(`/projects/${project.id}`) ? "bg-surface text-foreground" : "text-foreground-muted hover:text-foreground",
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", project.active_run ? "bg-emerald-500" : project.runtime === "running" ? "bg-sky-500" : "bg-border")} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.branch ? <span className="shrink-0 font-mono text-[10.5px] text-muted">{project.branch}</span> : null}
            </Link>
          ))}
          {hasAdminAccess && projects.length === 0 && !projectsQuery.isLoading ? <p className="px-2 text-xs text-muted">No projects yet.</p> : null}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {!narrow ? (
        <div className="mt-2 border-t border-border pt-2">
          <button type="button" onClick={() => setClassicOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] text-muted hover:text-foreground" aria-expanded={classicOpen}>
            <Wrench className="h-3.5 w-3.5" />
            <span className="flex-1">Classic tools</span>
            <ChevronRight className={cn("h-3 w-3 transition-transform", classicOpen && "rotate-90")} />
          </button>
          {classicOpen ? (
            <div className="space-y-0.5 pl-3 pt-0.5">
              {classicItems.map((item) => (
                <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} collapsed={false} onClick={onClose} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
