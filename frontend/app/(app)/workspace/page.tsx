"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FolderOpen, LoaderCircle, MicOff, Video, Waves } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { libraryQueryKey } from "@/lib/library";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { VideoAsset } from "@/types";

type QueueStatus = "queued" | "uploading" | "uploaded" | "failed";

type VideoQueueItem = {
  id: string;
  file: File;
  relativePath: string;
  status: QueueStatus;
  error?: string;
  uploadedId?: string;
};

type DirectoryCapableInput = HTMLInputElement & {
  webkitdirectory?: boolean;
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "mkv", "webm", "m4v"]);

function isVideoFile(file: File) {
  if (file.type.startsWith("video/")) {
    return true;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXTENSIONS.has(extension);
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function WorkspacePage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const queryClient = useQueryClient();
  const folderInputRef = useRef<DirectoryCapableInput | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [queue, setQueue] = useState<VideoQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const videosQuery = useQuery({
    queryKey: ["videos"],
    queryFn: () => (token ? api.getVideos(token) : Promise.resolve([] as VideoAsset[])),
  });

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) {
      return;
    }
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  const queuedCount = queue.filter((item) => item.status === "queued").length;
  const uploadedCount = queue.filter((item) => item.status === "uploaded").length;
  const failedCount = queue.filter((item) => item.status === "failed").length;

  const addFilesToQueue = (files: FileList | null) => {
    const selection = Array.from(files ?? []).filter(isVideoFile);
    if (!selection.length) {
      setNotice("No supported video files were found in that selection.");
      return;
    }

    setNotice(`Added ${selection.length} video${selection.length === 1 ? "" : "s"} to the workspace queue.`);
    setQueue((current) => [
      ...current,
      ...selection.map((file, index) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${current.length + index}`,
        file,
        relativePath: "webkitRelativePath" in file && file.webkitRelativePath ? file.webkitRelativePath : file.name,
        status: "queued" as const,
      })),
    ]);
  };

  const openFolderPicker = () => folderInputRef.current?.click();
  const openFilePicker = () => fileInputRef.current?.click();

  const startUpload = async () => {
    if (!token || isUploading || !queuedCount) {
      return;
    }

    setIsUploading(true);
    setNotice("Uploading videos one after another and queueing analysis jobs.");

    try {
      for (const item of queue) {
        if (item.status !== "queued") {
          continue;
        }

        setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "uploading", error: undefined } : entry)));

        try {
          const uploaded = await api.uploadVideo(token, item.file);
          setQueue((current) =>
            current.map((entry) =>
              entry.id === item.id ? { ...entry, status: "uploaded", uploadedId: uploaded.id } : entry,
            ),
          );
          await queryClient.invalidateQueries({ queryKey: ["videos"] });
          await queryClient.invalidateQueries({ queryKey: ["jobs"] });
          await queryClient.invalidateQueries({ queryKey: libraryQueryKey });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          setQueue((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "failed", error: message } : entry)));
        }
      }
      setNotice("Video upload pass finished. Each file has been queued for Whisper transcription.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
        <Topbar
          title="Video workspace"
          description="Open a local folder of videos, send them through the queue one by one, and let Olanma transcribe them with its built-in Whisper pipeline."
        />

      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[2rem] border border-border bg-surface px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">Local Folder Intake</p>
              <h2 className="mt-3 text-2xl font-semibold text-foreground">Batch-run a folder of videos from your computer</h2>
              <p className="mt-3 text-sm leading-7 text-foreground-muted">
                Pick a folder in the browser, Olanma filters out the video files, uploads them one at a time, and creates
                analysis jobs automatically. Videos with speech go through Whisper transcription, and the per-file upload limit is controlled by backend configuration.
              </p>
            </div>

            <div className="grid min-w-60 gap-3 rounded-[1.75rem] bg-background-secondary/70 p-4">
              <Button className="justify-start gap-2 rounded-2xl" onClick={openFolderPicker}>
                <FolderOpen className="h-4 w-4" />
                Choose folder
              </Button>
              <Button variant="outline" className="justify-start gap-2 rounded-2xl" onClick={openFilePicker}>
                <Video className="h-4 w-4" />
                Choose files
              </Button>
              <Button
                variant="secondary"
                className="justify-start gap-2 rounded-2xl"
                onClick={startUpload}
                disabled={!queuedCount || isUploading || !token}
              >
                {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Waves className="h-4 w-4" />}
                {isUploading ? "Uploading queue..." : "Start analysis queue"}
              </Button>
            </div>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              addFilesToQueue(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,.mp4,.mov,.mkv,.webm,.m4v"
            multiple
            className="hidden"
            onChange={(event) => {
              addFilesToQueue(event.target.files);
              event.target.value = "";
            }}
          />

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              { label: "Queued", value: queuedCount, tone: "text-foreground" },
              { label: "Uploaded", value: uploadedCount, tone: "text-primary" },
              { label: "Needs retry", value: failedCount, tone: "text-amber-600 dark:text-amber-400" },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.5rem] border border-border bg-background px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground-muted">{item.label}</p>
                <p className={cn("mt-2 text-3xl font-semibold", item.tone)}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-dashed border-border bg-background px-4 py-4 text-sm text-foreground-muted">
            {notice ?? "Start by choosing a folder or a set of videos from your local machine."}
          </div>
        </Card>

        <Card className="rounded-[2rem] border border-border bg-surface px-6 py-6">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <MicOff className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">What happens per video</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-foreground-muted">
                <p>1. The selected local video file is uploaded into Olanma storage.</p>
                <p>2. A Celery job transcribes that file with the local Whisper pipeline.</p>
                <p>3. Returned transcript text is saved and indexed.</p>
                <p>4. Summaries and follow-on analysis are generated from the transcript.</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[2rem] border border-border bg-surface px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Folder queue</h2>
              <p className="mt-1 text-sm text-foreground-muted">Videos are kept in order and uploaded sequentially so you can monitor each item.</p>
            </div>
            <Button variant="ghost" className="rounded-2xl" onClick={() => setQueue([])} disabled={isUploading || !queue.length}>
              Clear queue
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {queue.length ? (
              queue.map((item) => (
                <div key={item.id} className="rounded-[1.5rem] border border-border bg-background px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{item.file.name}</p>
                      <p className="mt-1 truncate text-xs text-foreground-muted">{item.relativePath}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                        item.status === "uploaded" && "border-primary/20 bg-primary/10 text-primary",
                        item.status === "uploading" && "border-border bg-surface text-foreground",
                        item.status === "queued" && "border-border bg-surface text-foreground-muted",
                        item.status === "failed" && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
                      )}
                    >
                      {item.status}
                    </span>
                  </div>
                  {item.error ? <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{item.error}</p> : null}
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-foreground-muted">
                No videos queued yet.
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[2rem] border border-border bg-surface px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Recent videos</h2>
              <p className="mt-1 text-sm text-foreground-muted">Latest items already inside the library and processing pipeline.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {videosQuery.data?.length ? (
              videosQuery.data.slice(0, 8).map((video) => (
                <div key={video.id} className="rounded-[1.5rem] border border-border bg-background px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{video.name}</p>
                      <p className="mt-1 text-xs text-foreground-muted">{formatTimestamp(video.created_at)}</p>
                    </div>
                    <span className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
                      {video.status}
                    </span>
                  </div>
                  {video.summary ? <p className="mt-3 text-xs leading-6 text-foreground-muted">{video.summary}</p> : null}
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-foreground-muted">
                No processed videos yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
