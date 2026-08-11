"use client";

import { Topbar } from "@/components/layout/topbar";

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Topbar title={title} description={description} />
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-4 pr-1">
        {children}
      </div>
    </div>
  );
}
