import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-none rounded-lg border border-border bg-surface text-foreground px-3.5 py-2.5 text-sm placeholder:text-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}
