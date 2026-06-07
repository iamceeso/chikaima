"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "@/components/models/model-selector";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (title: string, modelId?: string) => Promise<void>;
  isLoading?: boolean;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: NewConversationDialogProps) {
  const [title, setTitle] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    try {
      setIsSubmitting(true);
      await onSubmit(title, selectedModel);
      setTitle("");
      setSelectedModel(undefined);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
          <DialogDescription>
            Create a new conversation with an optional title and model selection.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="What would you like to chat about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isSubmitting || isLoading}
              autoFocus
            />
          </div>

          <ModelSelector
            value={selectedModel}
            onChange={setSelectedModel}
            disabled={isSubmitting || isLoading}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting || isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || isSubmitting || isLoading}
          >
            {isSubmitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
