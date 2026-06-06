"use client";

import { useQuery } from "@tanstack/react-query";
import { AudioLines, FileText, Library, Video } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export default function LibraryPage() {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const documentsQuery = useQuery({
    queryKey: ["documents"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getDocuments(token);
    },
  });
  const audioQuery = useQuery({
    queryKey: ["audio-assets"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getAudioAssets(token);
    },
  });
  const videosQuery = useQuery({
    queryKey: ["videos"],
    queryFn: () => {
      if (!token) {
        return Promise.resolve([]);
      }
      return api.getVideos(token);
    },
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

  return (
    <>
      <Topbar
        title="Media library"
        description="Your upload-first workspace for transcripts, summaries, and extracted content intelligence."
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">What comes next</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              This view will evolve into a full asset library with upload, transcript, summary, and key-point drilldown.
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}
