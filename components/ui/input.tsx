import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-surface text-foreground px-3.5 py-2.5 text-sm placeholder:text-muted transition-colors focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
        className,
      )}
      {...props}
    />
  );
}
