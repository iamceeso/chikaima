"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";
import type { AssetResourceType } from "@/types";

type AssetPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: AssetResourceType;
  resourceId: string;
  name: string;
  mimeType?: string | null;
  reference?: string | null;
};

function isImageType(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdfType(mimeType: string) {
  return mimeType === "application/pdf";
}

function isAudioType(mimeType: string) {
  return mimeType.startsWith("audio/");
}

function isVideoType(mimeType: string) {
  return mimeType.startsWith("video/");
}

function isTextLikeType(mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType.includes("javascript")
  );
}

export function AssetPreviewDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  name,
  mimeType,
  reference,
}: AssetPreviewDialogProps) {
  const token = useAuthStore((state) => state.tokens?.access_token);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [detectedMimeType, setDetectedMimeType] = useState<string>(mimeType || "");
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) {
      return;
    }

    let isActive = true;
    let nextObjectUrl: string | null = null;

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);
        setTextPreview(null);
        setObjectUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }
          return null;
        });

        const blob = await api.getAssetFile(token, resourceType, resourceId);
        if (!isActive) {
          return;
        }

        const nextMimeType = blob.type || mimeType || "";
        setDetectedMimeType(nextMimeType);

        if (isTextLikeType(nextMimeType)) {
          setTextPreview(await blob.text());
          return;
        }

        if (!isPdfType(nextMimeType) && !isImageType(nextMimeType) && resourceType === "document") {
          const transcript = await api.getTranscript(token, resourceType, resourceId);
          if (!isActive) {
            return;
          }
          setTextPreview(transcript.content);
          return;
        }

        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      } catch (previewError) {
        if (!isActive) {
          return;
        }
        setError(previewError instanceof Error ? previewError.message : "Could not load preview.");
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadPreview();

    return () => {
      isActive = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [mimeType, open, resourceId, resourceType, token]);

  const viewer = useMemo(() => {
    if (textPreview) {
      return (
        <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-2xl border border-border bg-background-secondary p-4 text-sm text-foreground">
          {textPreview}
        </pre>
      );
    }

    if (!objectUrl) {
      return null;
    }

    if (isImageType(detectedMimeType)) {
      return (
        <div className="flex max-h-[65vh] items-center justify-center overflow-auto rounded-2xl border border-border bg-background-secondary p-4">
          <Image src={objectUrl} alt={name} width={1600} height={1200} unoptimized className="max-h-[60vh] w-auto max-w-full object-contain" />
        </div>
      );
    }

    if (isPdfType(detectedMimeType)) {
      return (
        <iframe
          title={name}
          src={objectUrl}
          className="h-[65vh] w-full rounded-2xl border border-border bg-background-secondary"
        />
      );
    }

    if (isAudioType(detectedMimeType)) {
      return <audio controls src={objectUrl} className="w-full" />;
    }

    if (isVideoType(detectedMimeType)) {
      return <video controls src={objectUrl} className="max-h-[65vh] w-full rounded-2xl border border-border bg-black" />;
    }

    return null;
  }, [detectedMimeType, name, objectUrl, textPreview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenChange={onOpenChange} className="max-w-5xl p-0">
        <div className="flex max-h-[85vh] flex-col overflow-hidden rounded-lg">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="pr-8">{name}</DialogTitle>
            <DialogDescription>
              {reference || `${resourceType[0].toUpperCase()}${resourceType.slice(1)} preview`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
            {loading ? (
              <div className="flex min-h-80 items-center justify-center text-foreground-muted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading preview...
              </div>
            ) : error ? (
              <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-background-secondary px-6 text-center">
                <FileText className="mb-3 h-8 w-8 text-foreground-muted" />
                <p className="text-sm font-medium text-foreground">Preview unavailable</p>
                <p className="mt-2 text-sm text-foreground-muted">{error}</p>
              </div>
            ) : (
              viewer
            )}
          </div>

          {objectUrl ? (
            <div className="border-t border-border px-6 py-4">
              <Button type="button" variant="outline" onClick={() => window.open(objectUrl, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in new tab
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
