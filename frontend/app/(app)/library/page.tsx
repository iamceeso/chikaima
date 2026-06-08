"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, FileText, Library, Search, Trash2, Video } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { AudioAsset, DocumentAsset, VideoAsset } from "@/types";

type LibraryAsset = {
  id: string;
  name: string;
  kind: "audio" | "video" | "document";
  status: string;
  created_at: string;
  summary: string | null;
  detail: string;
};

const kindMeta = {
  audio: {
    label: "Audio",
    icon: AudioLines,
    empty: "Transcripts appear here as soon as uploads finish processing.",
  },
  video: {
    label: "Video",
    icon: Video,
    empty: "Video analysis, chapters, and summaries show up here after processing.",
  },
  document: {
    label: "Documents",
    icon: FileText,
    empty: "Document summaries and extracted text become searchable here.",
  },
} as const;

function toLibraryAsset(asset: AudioAsset | VideoAsset | DocumentAsset, kind: LibraryAsset["kind"]): LibraryAsset {
  if (kind === "audio") {
    const audioAsset = asset as AudioAsset;
    return {
      id: audioAsset.id,
      name: audioAsset.name,
      kind,
      status: audioAsset.status,
      created_at: audioAsset.created_at,
      summary: audioAsset.transcript
        ? `${audioAsset.transcript.slice(0, 180)}${audioAsset.transcript.length > 180 ? "..." : ""}`
        : null,
      detail: "Transcript-ready audio workspace",
    };
  }

  if (kind === "video") {
    const videoAsset = asset as VideoAsset;
    return {
      id: videoAsset.id,
      name: videoAsset.name,
      kind,
      status: videoAsset.status,
      created_at: videoAsset.created_at,
      summary: videoAsset.summary,
      detail: `${Array.isArray(videoAsset.action_items) ? videoAsset.action_items.length : 0} action items`,
    };
  }

  const documentAsset = asset as DocumentAsset;
  return {
    id: documentAsset.id,
    name: documentAsset.name,
    kind,
    status: documentAsset.status,
    created_at: documentAsset.created_at,
    summary: documentAsset.summary,
    detail: documentAsset.mime_type,
  };
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function LibraryPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<LibraryAsset["kind"] | "all">("all");
  const [assetPendingDelete, setAssetPendingDelete] = useState<LibraryAsset | null>(null);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => (token ? api.getDocuments(token) : Promise.resolve([])),
  });
  const audioQuery = useQuery({
    queryKey: ["audio-assets"],
    queryFn: () => (token ? api.getAudioAssets(token) : Promise.resolve([])),
  });
  const videosQuery = useQuery({
    queryKey: ["videos"],
    queryFn: () => (token ? api.getVideos(token) : Promise.resolve([])),
  });

  const sections = [
    {
      title: "Audio",
      count: audioQuery.data?.length ?? 0,
      detail: "Meetings, voice notes, podcasts, and interviews ready for transcription.",
      icon: AudioLines,
    },
    {
      title: "Video",
      count: videosQuery.data?.length ?? 0,
      detail: "Recorded meetings, YouTube exports, and long-form media waiting for analysis.",
      icon: Video,
    },
    {
      title: "Documents",
      count: documentsQuery.data?.length ?? 0,
      detail: "PDFs and text files available for summarization and knowledge extraction.",
      icon: FileText,
    },
  ];

  const assets = useMemo(() => {
    const merged = [
      ...(audioQuery.data ?? []).map((item) => toLibraryAsset(item, "audio")),
      ...(videosQuery.data ?? []).map((item) => toLibraryAsset(item, "video")),
      ...(documentsQuery.data ?? []).map((item) => toLibraryAsset(item, "document")),
    ];

    return merged.sort((left, right) => right.created_at.localeCompare(left.created_at));
  }, [audioQuery.data, documentsQuery.data, videosQuery.data]);

  const filteredAssets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (activeKind !== "all" && asset.kind !== activeKind) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [asset.name, asset.summary ?? "", asset.detail]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [activeKind, assets, query]);

  const loading = documentsQuery.isLoading || audioQuery.isLoading || videosQuery.isLoading;

  const refreshAssets = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
      queryClient.invalidateQueries({ queryKey: ["audio-assets"] }),
      queryClient.invalidateQueries({ queryKey: ["videos"] }),
    ]);
  };

  const deleteAsset = useMutation({
    mutationFn: async (asset: LibraryAsset) => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      if (asset.kind === "document") {
        await api.deleteDocument(token, asset.id);
        return;
      }
      if (asset.kind === "audio") {
        await api.deleteAudioAsset(token, asset.id);
        return;
      }
      await api.deleteVideo(token, asset.id);
    },
    onSuccess: refreshAssets,
  });

  const clearAllAssets = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Please sign in first.");
      }
      await Promise.all([api.clearDocuments(token), api.clearAudioAssets(token), api.clearVideos(token)]);
    },
    onSuccess: refreshAssets,
  });

  const handleDeleteAsset = (asset: LibraryAsset) => {
    setAssetPendingDelete(asset);
  };

  const handleClearAll = () => {
    if (!assets.length) {
      return;
    }
    setClearAllOpen(true);
  };

  return (
    <>
      <Topbar
        title="Media library"
        description="Browse processed audio, video, and documents with search-ready summaries and transcript context."
      />

      <div className="grid gap-3 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title} className="rounded-3xl bg-surface px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{section.title}</p>
                  <div className="mt-2 flex items-end gap-2">
                    <p className="text-2xl font-semibold text-foreground">{section.count}</p>
                    <p className="pb-0.5 text-xs text-foreground-muted">{section.detail}</p>
                  </div>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Icon className="h-4.5 w-4.5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mt-3 flex max-h-[calc(100vh-18rem)] min-h-128 flex-col rounded-3xl bg-surface px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Asset browser</h2>
            <p className="mt-1 max-w-3xl text-sm text-foreground-muted">
              Search across filenames, summaries, and transcript excerpts while processing continues in the background.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-nowrap items-center gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search your library" />
          </div>
          {(["all", "audio", "video", "document"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setActiveKind(kind)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
                activeKind === kind
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground-muted hover:text-foreground",
              )}
            >
              {kind === "all" ? "All assets" : kindMeta[kind].label}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={!assets.length || clearAllAssets.isPending}
            className="shrink-0"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {clearAllAssets.isPending ? "Clearing..." : "Clear all assets"}
          </Button>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-3">
            {loading ? (
              <div className="rounded-3xl border border-dashed border-border px-5 py-8 text-sm text-foreground-muted">
                Loading library assets...
              </div>
            ) : filteredAssets.length ? (
              filteredAssets.map((asset) => {
                const meta = kindMeta[asset.kind];
                const Icon = meta.icon;
                return (
                  <div key={asset.id} className="rounded-[1.25rem] border border-border bg-background/70 px-4 py-3.5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">{asset.name}</h3>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                              {meta.label}
                            </span>
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-muted">
                              {formatStatus(asset.status)}
                            </span>
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm text-foreground-muted">{asset.summary || meta.empty}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">
                            {asset.detail} · Added {formatTimestamp(asset.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-start">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAsset(asset)}
                          disabled={deleteAsset.isPending || clearAllAssets.isPending}
                          className="text-foreground-muted hover:text-foreground"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-3xl border border-dashed border-border px-5 py-8 text-sm text-foreground-muted">
                No assets match this filter yet.
              </div>
            )}
          </div>
        </div>
      </Card>

      <AlertDialog
        open={Boolean(assetPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteAsset.isPending) {
            setAssetPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {assetPendingDelete
                ? `This will remove ${assetPendingDelete.name} and its related transcript, summaries, embeddings, jobs, and stored file.`
                : "This asset will be removed from your library."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={deleteAsset.isPending}
              onClick={() => setAssetPendingDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={deleteAsset.isPending || !assetPendingDelete}
              onClick={() => {
                if (!assetPendingDelete) {
                  return;
                }
                deleteAsset.mutate(assetPendingDelete, {
                  onSuccess: async () => {
                    setAssetPendingDelete(null);
                    await refreshAssets();
                  },
                });
              }}
            >
              {deleteAsset.isPending ? "Deleting..." : "Delete asset"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={clearAllOpen}
        onOpenChange={(open) => {
          if (!open && !clearAllAssets.isPending) {
            setClearAllOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all assets?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove every audio file, video, and document in your library, along with related transcripts,
              summaries, embeddings, jobs, and stored files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="border border-border"
              disabled={clearAllAssets.isPending}
              onClick={() => setClearAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={clearAllAssets.isPending || !assets.length}
              onClick={() => {
                clearAllAssets.mutate(undefined, {
                  onSuccess: async () => {
                    setClearAllOpen(false);
                    await refreshAssets();
                  },
                });
              }}
            >
              {clearAllAssets.isPending ? "Clearing..." : "Clear all assets"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
