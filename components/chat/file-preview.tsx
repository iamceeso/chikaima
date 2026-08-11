"use client";

import { AlertCircle, FileIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AttachedFile } from "@/hooks/useFileAttachments";

interface FilePreviewProps {
  files: AttachedFile[];
  onRemove: (fileId: string) => void;
  isUploading?: boolean;
}

export function FilePreview({ files, onRemove, isUploading }: FilePreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/20">
      <p className="text-xs font-medium text-foreground-muted mb-2">
        Attached Files ({files.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
          >
            <FileIcon className="h-4 w-4 text-foreground-muted" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.file.name}</p>
              <p className="text-xs text-foreground-muted">
                {(file.file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            {file.status === "uploading" ? (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-foreground-muted">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading
              </span>
            ) : null}
            {file.status === "uploaded" || file.uploadedAt ? (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Uploaded
              </span>
            ) : null}
            {file.status === "error" ? (
              <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                Failed
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => onRemove(file.id)}
              disabled={isUploading}
              title="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
