"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, CornerLeftUp, Folder, FolderGit2, FolderPlus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";

/**
 * Picks the project's folder from the server's projects root: browse into
 * subfolders, choose an existing one, or name a new folder in the current
 * location. Folders already used by a project can't be chosen twice.
 */
export function FolderPicker({ access, value, onChange, allowExisting = true }: { access: ApiAccess; value: string; onChange: (folder: string) => void; allowExisting?: boolean }) {
  const [location, setLocation] = useState("");
  const [newName, setNewName] = useState("");
  const listing = useQuery({ queryKey: ["collab-folders", location], queryFn: () => api.getProjectFolders(access, location) });
  const crumbs = location ? location.split("/") : [];
  const join = (name: string) => (location ? `${location}/${name}` : name);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 font-mono text-[11.5px] text-foreground-muted">
        <button type="button" onClick={() => setLocation("")} className="hover:text-foreground" title={listing.data?.root}>
          {listing.data?.root ?? "projects"}
        </button>
        {crumbs.map((crumb, index) => (
          <span key={index} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button type="button" onClick={() => setLocation(crumbs.slice(0, index + 1).join("/"))} className="hover:text-foreground">
              {crumb}
            </button>
          </span>
        ))}
      </div>

      <ul className="max-h-56 overflow-y-auto py-1 text-[13px]">
        {listing.data?.parent !== null && listing.data?.parent !== undefined ? (
          <li>
            <button type="button" onClick={() => setLocation(listing.data!.parent!)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-foreground-muted hover:bg-surface">
              <CornerLeftUp className="h-3.5 w-3.5" /> ..
            </button>
          </li>
        ) : null}
        {listing.data?.folders.map((folder) => {
          const taken = Boolean(folder.projectId);
          const selected = value === folder.path;
          return (
            <li key={folder.path} className={cn("flex items-center gap-2 px-3 py-1 hover:bg-surface", selected && "bg-primary/12")}>
              <button type="button" onClick={() => setLocation(folder.path)} className="flex min-w-0 flex-1 items-center gap-2 py-0.5 text-left text-foreground" title="Open folder">
                {folder.isGit ? <FolderGit2 className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0 text-foreground-muted" />}
                <span className="truncate">{folder.name}</span>
                {folder.isGit ? <span className="shrink-0 text-[10.5px] text-muted">git</span> : null}
              </button>
              {taken ? (
                <span className="shrink-0 text-[11px] text-muted">already a project</span>
              ) : allowExisting ? (
                <button
                  type="button"
                  onClick={() => onChange(folder.path)}
                  className={cn("shrink-0 rounded px-2 py-0.5 text-[11.5px]", selected ? "bg-primary text-primary-foreground" : "border border-border text-foreground-muted hover:text-foreground")}
                >
                  {selected ? "Selected" : "Use this folder"}
                </button>
              ) : null}
            </li>
          );
        })}
        {listing.data && listing.data.folders.length === 0 ? <li className="px-3 py-2 text-xs text-muted">No folders here.</li> : null}
        {listing.error ? <li className="px-3 py-2 text-xs text-destructive">{listing.error.message}</li> : null}
      </ul>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <FolderPlus className="h-4 w-4 shrink-0 text-foreground-muted" />
        <Input
          className="h-8 flex-1 text-xs"
          value={newName}
          onChange={(event) => {
            const name = event.target.value.replace(/[/\\]/g, "-");
            setNewName(name);
            onChange(name.trim() ? join(name.trim()) : "");
          }}
          placeholder={`New folder in ${location || "the projects root"}…`}
        />
      </div>
      {value ? (
        <p className="border-t border-border px-3 py-1.5 font-mono text-[11.5px] text-foreground">
          Project folder: <span className="text-primary">{value}</span>
        </p>
      ) : null}
      <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted">
        Only folders inside this root are available. To pick from your existing code, set CHIKAIMA_COLLAB_ROOT to its parent folder (for example ~/Projects) and restart Chikaima.
      </p>
    </div>
  );
}
