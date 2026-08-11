"use client";

import { useState } from "react";
import { BookOpen, Eye, FileText, Quote } from "lucide-react";

import { AssetPreviewDialog } from "@/components/assets/asset-preview-dialog";
import { Button } from "@/components/ui/button";
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
  const [activeCitation, setActiveCitation] = useState<RAGCitation | null>(null);

  if (!citations.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-background/80 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground-muted">
        <BookOpen className="h-3.5 w-3.5" />
        <span>Sources</span>
      </div>
      <div className="space-y-1.5">
        {citations.map((citation) => (
          <div
            key={citation.chunk_id}
            className="rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground-muted"
          >
            <div className="flex items-start gap-1.5">
              <FileText className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{citation.filename}</p>
                <p className="mt-0.5 text-[10px] leading-4">{citation.reference}</p>
                {citation.excerpt ? (
                  <div className="mt-1.5 flex gap-1.5 text-[10px] leading-4 text-foreground-muted">
                    <Quote className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                    <p className="line-clamp-2 whitespace-pre-wrap">{citation.excerpt}</p>
                  </div>
                ) : null}
                {citation.source_type === "document" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveCitation(citation)}
                    className="mt-1.5 h-6 px-2 text-[10px] text-foreground-muted hover:text-foreground"
                  >
                    <Eye className="mr-1 h-3 w-3" />
                    Preview source
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeCitation ? (
        <AssetPreviewDialog
          open={Boolean(activeCitation)}
          onOpenChange={(open) => {
            if (!open) {
              setActiveCitation(null);
            }
          }}
          resourceType="document"
          resourceId={activeCitation.source_id}
          name={activeCitation.filename}
          reference={activeCitation.reference}
        />
      ) : null}
    </div>
  );
}
