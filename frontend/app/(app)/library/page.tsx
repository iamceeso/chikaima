"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AudioLines, FileText, Library, Search, Video } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
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
    return {
      id: asset.id,
      name: asset.name,
      kind,
      status: asset.status,
      created_at: asset.created_at,
      summary: asset.transcript ? `${asset.transcript.slice(0, 180)}${asset.transcript.length > 180 ? "..." : ""}` : null,
      detail: "Transcript-ready audio workspace",
    };
  }

  if (kind === "video") {
    return {
      id: asset.id,
      name: asset.name,
      kind,
      status: asset.status,
      created_at: asset.created_at,
      summary: asset.summary,
      detail: `${Array.isArray(asset.action_items) ? asset.action_items.length : 0} action items`,
    };
  }

  return {
    id: asset.id,
    name: asset.name,
    kind,
    status: asset.status,
    created_at: asset.created_at,
    summary: asset.summary,
    detail: asset.mime_type,
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
  const [query, setQuery] = useState("");
  const [activeKind, setActiveKind] = useState<LibraryAsset["kind"] | "all">("all");

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

  return (
    <>
      <Topbar
        title="Media library"
        description="Browse processed audio, video, and documents with search-ready summaries and transcript context."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.title} className="rounded-[1.75rem] bg-surface p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">{section.title}</p>
                  <p className="mt-3 text-3xl font-semibold text-foreground">{section.count}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-foreground-muted">{section.detail}</p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 rounded-[1.75rem] bg-surface p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <Library className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Asset browser</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                Search across filenames, summaries, and transcript excerpts while processing continues in the background.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:w-[28rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search your library" />
            </div>
            <div className="flex flex-wrap gap-2">
              {(["all", "audio", "video", "document"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setActiveKind(kind)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    activeKind === kind
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground-muted hover:text-foreground",
                  )}
                >
                  {kind === "all" ? "All assets" : kindMeta[kind].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {loading ? (
            <div className="rounded-[1.5rem] border border-dashed border-border px-5 py-8 text-sm text-foreground-muted">
              Loading library assets...
            </div>
          ) : filteredAssets.length ? (
            filteredAssets.map((asset) => {
              const meta = kindMeta[asset.kind];
              const Icon = meta.icon;
              return (
                <div key={asset.id} className="rounded-[1.5rem] border border-border bg-background/70 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-foreground">{asset.name}</h3>
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                            {meta.label}
                          </span>
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-foreground-muted">
                            {formatStatus(asset.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-foreground-muted">{asset.summary || meta.empty}</p>
                        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-muted">
                          {asset.detail} · Added {formatTimestamp(asset.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border px-5 py-8 text-sm text-foreground-muted">
              No assets match this filter yet.
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
