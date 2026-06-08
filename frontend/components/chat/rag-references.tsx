"use client";

import { BookOpen, FileText, Quote } from "lucide-react";

import type { Message, RAGCitation } from "@/types";

interface RAGReferencesProps {
  message: Message;
}

function isCitation(value: unknown): value is RAGCitation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RAGCitation>;
  return (
    typeof candidate.source_id === "string" &&
    typeof candidate.filename === "string" &&
    typeof candidate.reference === "string" &&
    typeof candidate.chunk_id === "string"
  );
}

function getCitations(message: Message): RAGCitation[] {
  const raw = message.metadata?.rag_citations;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isCitation);
}

export function RAGReferences({ message }: RAGReferencesProps) {
  const citations = getCitations(message);

  if (!citations.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-background/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
        <BookOpen className="h-3.5 w-3.5" />
        <span>Sources</span>
      </div>
      <div className="space-y-2">
        {citations.map((citation) => (
          <div
            key={citation.chunk_id}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground-muted"
          >
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{citation.filename}</p>
                <p className="mt-0.5 text-[11px]">{citation.reference}</p>
                {citation.excerpt ? (
                  <div className="mt-2 flex gap-1.5 text-[11px] leading-5 text-foreground-muted">
                    <Quote className="mt-0.5 h-3 w-3 shrink-0" />
                    <p className="whitespace-pre-wrap">{citation.excerpt}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
