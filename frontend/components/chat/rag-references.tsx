"use client";

import { BookOpen } from "lucide-react";
import type { Message } from "@/types";

interface RAGReferencesProps {
  message: Message;
}

export function RAGReferences({ message }: RAGReferencesProps) {
  const contextIds = message.metadata?.rag_context_ids as string[] | undefined;

  if (!contextIds || contextIds.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center gap-2 text-xs text-foreground-muted mb-2">
        <BookOpen className="h-3 w-3" />
        <span>Sources referenced:</span>
      </div>
      <div className="space-y-1">
        {contextIds.map((id, idx) => (
          <div key={idx} className="text-xs text-foreground-muted bg-muted/30 px-2 py-1 rounded">
            <span className="font-mono">{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
