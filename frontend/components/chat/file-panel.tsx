"use client";

import { useState } from "react";
import { Eye, Trash2, X } from "lucide-react";

import { AssetPreviewDialog } from "@/components/assets/asset-preview-dialog";
import { Button } from "@/components/ui/button";
import type { DocumentAsset } from "@/types";
interface FilePanelProps {
  files: DocumentAsset[];
  isOpen: boolean;
  onToggle: () => void;
  onRemove?: (fileId: string) => Promise<void>;
  isLoading?: boolean;
}

export function FilePanel({
  files,
  isOpen,
  onToggle,
  onRemove,
  isLoading,
}: FilePanelProps) {
  const [previewFile, setPreviewFile] = useState<DocumentAsset | null>(null);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileSize = (file: DocumentAsset) => {
    const f = file as DocumentAsset & {
      size?: number;
      file_size?: number;
      bytes?: number;
    };
    return f.size ?? f.file_size ?? f.bytes ?? 0;
  };

  const getPageCount = (file: DocumentAsset) => {
    const pages = file.metadata?.pages;
    return typeof pages === "number" ? pages : null;
  };

  return (
    <>
      {/* Toggle button */}
      <Button
        onClick={onToggle}
        variant="outline"
        size="sm"
        className="absolute bottom-4 right-4 gap-2"
        title="Toggle file panel"
      >
        {files.length > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-xs text-primary-foreground">
            {files.length}
          </span>
        )}
        {isOpen ? "Hide files" : "Show files"}
      </Button>

      {/* File panel */}
      {isOpen && (
        <div className="absolute bottom-16 right-4 w-80 max-h-96 bg-background border border-border rounded-lg shadow-lg overflow-hidden flex flex-col z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-secondary">
            <h3 className="font-semibold text-sm">Chat Files</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={onToggle}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {files.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-center">
                <p className="text-sm text-foreground-muted">
                  No files in this conversation yet
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => {
                  const pageCount = getPageCount(file);

                  return (
                    <div
                      key={file.id}
                      className="group flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 border border-transparent hover:border-border transition-colors"
                    >
                    <div className="flex-1 min-w-0 pt-1">
                      <p className="text-sm font-medium truncate text-foreground">
                        {file.name || "Untitled"}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <p className="text-xs text-foreground-muted">
                          {formatFileSize(getFileSize(file))}
                        </p>
                        {file.created_at && (
                          <>
                            <span className="text-xs text-foreground-muted">•</span>
                            <p className="text-xs text-foreground-muted">
                              {formatDate(file.created_at)}
                            </p>
                          </>
                        )}
                      </div>
                      {pageCount !== null && (
                        <p className="text-xs text-primary mt-1">
                          {pageCount} pages
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 shrink-0"
                      onClick={() => setPreviewFile(file)}
                      title="Preview file"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {onRemove && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        onClick={() => onRemove(file.id)}
                        disabled={isLoading}
                        title="Remove from chat"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {previewFile ? (
        <AssetPreviewDialog
          open={Boolean(previewFile)}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewFile(null);
            }
          }}
          resourceType="document"
          resourceId={previewFile.id}
          name={previewFile.name}
          mimeType={previewFile.mime_type}
        />
      ) : null}
    </>
  );
}
