"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Folder, RefreshCw, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, type ApiAccess } from "@/services/api";

/**
 * File explorer and editor for the team folder. The files are ordinary
 * files on disk; this view reads and writes them through the API. Saving is
 * blocked while agents are working so a human edit can't be swept into (or
 * reverted with) an agent's step.
 */
export function WorkspaceFiles({ access, teamId, agentsWorking, refreshKey }: { access: ApiAccess; teamId: string; agentsWorking: boolean; refreshKey: number }) {
  const queryClient = useQueryClient();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const filesQuery = useQuery({ queryKey: ["collab-files", teamId], queryFn: () => api.getCollabFiles(access, teamId) });
  const fileQuery = useQuery({
    queryKey: ["collab-file", teamId, openPath],
    queryFn: () => api.getCollabFile(access, teamId, openPath!),
    enabled: Boolean(openPath),
  });

  // Agents edit the folder during a run; refresh the tree (and the open file, unless the user is mid-edit) as they do.
  const { refetch: refetchFiles } = filesQuery;
  const { refetch: refetchFile } = fileQuery;
  const editing = draft !== null;
  useEffect(() => {
    if (refreshKey === 0) return;
    void refetchFiles();
    if (openPath && !editing) void refetchFile();
  }, [refreshKey, refetchFiles, refetchFile, openPath, editing]);

  const save = useMutation({
    mutationFn: () => api.saveCollabFile(access, teamId, openPath!, draft ?? ""),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["collab-file", teamId, openPath] });
      await queryClient.invalidateQueries({ queryKey: ["collab-files", teamId] });
    },
  });

  const content = draft ?? fileQuery.data?.content ?? "";
  const dirty = draft !== null && draft !== fileQuery.data?.content;

  return (
    <div className="grid min-h-112 gap-3 lg:grid-cols-[14rem_1fr]">
      <Card className="flex max-h-136 flex-col rounded-[1.25rem] bg-surface p-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Files</span>
          <button type="button" aria-label="Refresh files" onClick={() => void filesQuery.refetch()} className="text-foreground-muted hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {filesQuery.data?.entries.length ? (
            filesQuery.data.entries.map((entry) => {
              const depth = entry.path.split("/").length - 1;
              const name = entry.path.split("/").at(-1);
              return entry.type === "dir" ? (
                <div key={entry.path} className="flex items-center gap-1.5 py-0.5 text-xs text-foreground-muted" style={{ paddingLeft: depth * 12 + 4 }}>
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{name}</span>
                </div>
              ) : (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => {
                    if (dirty && !window.confirm("Discard unsaved changes?")) return;
                    setOpenPath(entry.path);
                    setDraft(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md py-0.5 pr-1 text-left text-xs",
                    entry.path === openPath ? "bg-background text-foreground" : "text-foreground-muted hover:text-foreground",
                  )}
                  style={{ paddingLeft: depth * 12 + 4 }}
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            })
          ) : (
            <p className="px-1 py-3 text-xs text-foreground-muted">{filesQuery.isLoading ? "Loading…" : "The folder is empty. Give the team a task, or add files to it."}</p>
          )}
          {filesQuery.data?.truncated ? <p className="px-1 pt-2 text-[11px] text-muted">Listing truncated.</p> : null}
        </div>
      </Card>

      <Card className="flex min-w-0 flex-col rounded-[1.25rem] bg-surface p-3">
        <div className="flex items-center gap-2 px-1">
          <span className="min-w-0 truncate font-mono text-xs text-foreground">{openPath ?? "No file open"}</span>
          {dirty ? <span className="text-[11px] text-primary">unsaved</span> : null}
          {openPath ? (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto h-8 border border-border px-2.5 text-xs"
              disabled={!dirty || save.isPending || agentsWorking}
              title={agentsWorking ? "Agents are working in this folder" : undefined}
              onClick={() => save.mutate()}
            >
              <Save className="mr-1 h-3.5 w-3.5" /> {save.isPending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </div>
        {save.error ?? fileQuery.error ? <p className="mt-1 px-1 text-xs text-destructive">{(save.error ?? fileQuery.error)!.message}</p> : null}
        {openPath ? (
          <textarea
            aria-label={`Contents of ${openPath}`}
            spellCheck={false}
            value={content}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                event.preventDefault();
                if (dirty && !agentsWorking) save.mutate();
              }
            }}
            className="mt-2 min-h-120 flex-1 resize-none rounded-xl border border-border bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        ) : (
          <div className="mt-2 flex min-h-120 flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-foreground-muted">
            Pick a file to view or edit it.
          </div>
        )}
      </Card>
    </div>
  );
}
