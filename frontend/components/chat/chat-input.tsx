"use client";

import { useState, useRef } from "react";
import { Send, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FilePreview } from "./file-preview";
import type { AttachedFile } from "@/hooks/useFileAttachments";

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  attachedFiles?: AttachedFile[];
  onRemoveFile?: (fileId: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onFileUpload,
  attachedFiles = [],
  onRemoveFile,
  isLoading = false,
  placeholder = "Type your message...",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isSending) return;

    try {
      setIsSending(true);
      await onSend(input.trim() || "Analyze the attached files.");
      setInput("");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file && onFileUpload) {
      try {
        setIsUploading(true);
        await onFileUpload(file);
      } catch (err) {
        console.error("Failed to upload file:", err);
      } finally {
        setIsUploading(false);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2 border-t border-border bg-background">
      {attachedFiles.length > 0 && (
        <FilePreview
          files={attachedFiles}
          onRemove={onRemoveFile || (() => {})}
          isUploading={isUploading}
        />
      )}
      <div className="p-4 space-y-2">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading || isSending || isUploading}
            className="resize-none min-h-[80px]"
          />
          <div className="flex flex-col gap-2">
            {onFileUpload && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isSending || isUploading}
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  accept=".pdf,.txt,.doc,.docx,.md"
                />
              </>
            )}
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || isLoading || isSending || isUploading}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-foreground-muted">
          Press <kbd className="rounded px-1.5 py-0.5 bg-muted">Enter</kbd> to send and <kbd className="rounded px-1.5 py-0.5 bg-muted">Shift + Enter</kbd> for a new line
        </p>
      </div>
    </div>
  );
}
