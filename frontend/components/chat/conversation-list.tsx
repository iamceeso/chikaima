"use client";

import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@/types";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  currentId?: string;
  isLoading?: boolean;
  onSelect: (conversation: Conversation) => void;
  onCreate: () => void;
  onDelete?: (id: string) => void;
}

export function ConversationList({
  conversations,
  currentId,
  isLoading,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="h-full flex flex-col bg-background-secondary border-r border-border">
      <div className="p-4 border-b border-border">
        <Button onClick={onCreate} disabled={isLoading} className="w-full gap-2">
          <Plus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 p-2">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <MessageSquare className="h-8 w-8 mx-auto text-foreground-muted/50 mb-2" />
            <p className="text-sm text-foreground-muted">No conversations yet</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer",
                currentId === conv.id
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-foreground",
              )}
            >
              <button
                onClick={() => onSelect(conv)}
                disabled={isLoading}
                className="flex-1 text-left truncate"
              >
                <div className="text-sm font-medium truncate">{conv.title}</div>
                {conv.updated_at && (
                  <div className={cn("text-xs truncate", currentId === conv.id ? "opacity-70" : "text-foreground-muted")}>
                    {new Date(conv.updated_at).toLocaleDateString()}
                  </div>
                )}
              </button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
                    currentId === conv.id ? "text-primary-foreground hover:bg-primary/90" : "",
                  )}
                  onClick={() => onDelete(conv.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
