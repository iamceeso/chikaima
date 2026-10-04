"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type ApiAccess } from "@/services/api";
import type { CollabTeam } from "@/types";

/** Confirms deleting a project. Its folder stays on disk unless you tick the box. */
export function DeleteProjectDialog({
  access,
  project,
  onClose,
  onDeleted,
}: {
  access: ApiAccess;
  project: CollabTeam;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleteFiles, setDeleteFiles] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteCollabTeam(access, project.id, { deleteFiles }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["collab-projects"] });
      await queryClient.invalidateQueries({ queryKey: ["collab-teams"] });
      onDeleted?.();
      onClose();
    },
  });

  return (
    <AlertDialog open onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
          <AlertDialogDescription>This removes the project, its AI team, tasks and run history from Chikaima.</AlertDialogDescription>
        </AlertDialogHeader>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" className="mt-0.5 accent-red-600" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.target.checked)} />
          <span>
            <span className="font-medium text-foreground">Also delete the folder on disk</span>
            <span className="mt-0.5 block font-mono text-[11.5px] text-muted">{project.folder}</span>
          </span>
        </label>
        <p className="mt-2 text-xs text-foreground-muted">
          {deleteFiles ? (
            <span className="text-destructive">
              Every file in the folder, including its git history, is deleted permanently. Save a copy first if you might need it.
            </span>
          ) : (
            "The files stay where they are; you can create a new project on the folder later."
          )}
        </p>
        {remove.error ? <p className="mt-3 text-sm text-destructive">{remove.error.message}</p> : null}
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {remove.isPending ? "Deleting…" : deleteFiles ? "Delete project and files" : "Delete project"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Copies the project folder to any location on this machine, such as another drive or a folder outside the projects root. */
export function SaveProjectCopyDialog({ access, project, onClose }: { access: ApiAccess; project: CollabTeam; onClose: () => void }) {
  const [destination, setDestination] = useState(`~/Desktop/${project.folder.split("/").at(-1)}`);
  const save = useMutation({ mutationFn: () => api.saveCollabProjectCopy(access, project.id, destination) });

  return (
    <AlertDialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Save a copy of {project.name}</AlertDialogTitle>
          <AlertDialogDescription>
            Copies the project folder, including its git history, to another location on this computer. <span className="font-mono text-xs">node_modules</span>,{" "}
            <span className="font-mono text-xs">.next</span> and other reinstallable folders are skipped.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {save.data ? (
          <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-foreground">
            Saved to <span className="break-all font-mono text-xs">{save.data.path}</span>
          </div>
        ) : (
          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <Label htmlFor="save-copy-destination">Save to</Label>
            <Input
              id="save-copy-destination"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              spellCheck={false}
              autoFocus
              className="font-mono text-[13px]"
              placeholder="~/Backups/my-app or /Volumes/Drive/my-app"
            />
            <p className="mt-1.5 text-xs text-foreground-muted">
              A full path to a new or empty folder; missing parent folders are created. ~ is your home folder on the machine running Chikaima.
            </p>
            {save.error ? <p className="mt-3 text-sm text-destructive">{save.error.message}</p> : null}
          </form>
        )}
        <AlertDialogFooter>
          {save.data ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={save.isPending}>
                Cancel
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending || !destination.trim()}>
                {save.isPending ? "Copying…" : "Save copy"}
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
