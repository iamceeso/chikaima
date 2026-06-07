"use client";

import { Button } from "@/components/ui/button";

interface SuggestedMessagesProps {
  suggestions: string[];
  onSelect: (message: string) => void;
  isLoading?: boolean;
}

export function SuggestedMessages({ suggestions, onSelect, isLoading }: SuggestedMessagesProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="p-4 border-t border-border bg-background-secondary">
      <p className="text-sm font-medium text-foreground-muted mb-3">Try asking:</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {suggestions.map((suggestion, idx) => (
          <Button
            key={idx}
            variant="outline"
            className="justify-start h-auto text-left whitespace-normal p-3"
            onClick={() => onSelect(suggestion)}
            disabled={isLoading}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_SUGGESTIONS = [
  "Summarize the main points",
  "What are the key takeaways?",
  "Can you explain this in simpler terms?",
  "What are potential next steps?",
];

export function useSuggestedMessages(contentType?: string): string[] {
  if (!contentType) return DEFAULT_SUGGESTIONS;

  const suggestions: Record<string, string[]> = {
    document: [
      "Summarize the key points",
      "Extract action items",
      "What is the main topic?",
      "Create an outline",
    ],
    transcript: [
      "Summarize the conversation",
      "Who are the speakers?",
      "What are the main topics discussed?",
      "Extract timestamps for specific topics",
    ],
    video: [
      "Summarize the video",
      "What are the key moments?",
      "Extract important scenes",
      "Generate a chapter list",
    ],
  };

  return suggestions[contentType] || DEFAULT_SUGGESTIONS;
}
