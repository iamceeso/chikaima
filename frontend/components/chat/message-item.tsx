"use client";

import { useState } from "react";
import { Edit2, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/types";
import { cn } from "@/lib/utils";

interface MessageItemProps {
  message: Message;
  isLoading?: boolean;
  onUpdate?: (content: string) => Promise<void>;
  onRegenerate?: () => Promise<void>;
}

export function MessageItem({ message, isLoading, onUpdate, onRegenerate }: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  const isUserMessage = message.role === "user";

  const handleSave = async () => {
    if (!onUpdate || editedContent === message.content) {
      setIsEditing(false);
      return;
    }

    try {
      setIsSaving(true);
      await onUpdate(editedContent);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedContent(message.content);
    setIsEditing(false);
  };

  const attachments = Array.isArray(message.metadata?.attachments)
    ? (message.metadata.attachments as Array<{
        id?: string;
        name?: string;
        size?: number;
        status?: string;
      }>)
    : [];

  return (
    <div
      className={cn(
        "flex gap-3 py-4 px-4 rounded-lg mb-3",
        isUserMessage ? "bg-primary/5 border border-primary/10" : "bg-muted/30 border border-border",
      )}
    >
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              disabled={isSaving}
              className="min-h-[100px] resize-none"
              placeholder="Edit your message..."
            />
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || editedContent.trim() === message.content.trim()}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm font-medium text-foreground-muted mb-1">
              {isUserMessage ? "You" : "Assistant"}
            </p>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <div
                    key={attachment.id ?? `${message.id}-attachment-${index}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground-muted"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="max-w-52 truncate">{attachment.name ?? "Attachment"}</span>
                    {typeof attachment.size === "number" ? (
                      <span className="text-muted">{(attachment.size / 1024).toFixed(1)} KB</span>
                    ) : null}
                    {attachment.status ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        {attachment.status}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {message.created_at && (
              <p className="text-xs text-foreground-muted mt-2">
                {new Date(message.created_at).toLocaleTimeString()}
              </p>
            )}
          </>
        )}
      </div>

      {!isEditing && isUserMessage && (
        <div className="flex gap-1">
          {onUpdate && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className="h-8 w-8 p-0"
              title="Edit message"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          {onRegenerate && !isUserMessage && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRegenerate}
              disabled={isLoading}
              className="h-8 w-8 p-0"
              title="Regenerate message"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {!isEditing && !isUserMessage && onRegenerate && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            disabled={isLoading}
            className="h-8 w-8 p-0"
            title="Regenerate message"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
