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
    <>
      <Topbar title={title} description={description} />
      {children}
    </>
  );
}
