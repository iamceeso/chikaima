"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Settings2, Shield, UserRound } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";

const sections = [
  {
    href: "/settings/workspace",
    label: "Workspace",
    icon: Building2,
    adminOnly: false,
  },
  {
    href: "/settings/users",
    label: "Users",
    icon: Shield,
    adminOnly: true,
  },
  {
    href: "/settings/providers",
    label: "Providers",
    icon: UserRound,
    adminOnly: false,
  },
];

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <Topbar title={title} description={description} />
      <div className="mb-6 rounded-[1.5rem] border border-border bg-background-secondary/70 p-3">
        <div className="grid gap-2 lg:grid-cols-3">
          {sections
            .filter((section) => !section.adminOnly || user?.is_superuser)
            .map((section) => {
              const active = pathname === section.href;
              const Icon = section.icon;
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className={cn(
                    "rounded-2xl border px-4 py-3 transition-colors",
                    active
                      ? "border-primary/35 bg-surface text-foreground"
                      : "border-border bg-background hover:bg-surface/70",
                  )}
                  >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{section.label}</p>
                    {active ? <Settings2 className="ml-auto h-4 w-4 text-muted" /> : null}
                  </div>
                </Link>
              );
            })}
        </div>
      </div>
      {children}
    </>
  );
}
