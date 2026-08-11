"use client";

import {
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type AlertDialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const AlertDialogContext = createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext() {
  const context = useContext(AlertDialogContext);
  if (!context) {
    throw new Error("AlertDialog components must be used within AlertDialog.");
  }
  return context;
}

export function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);

  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

export function AlertDialogPortal({ children }: { children: ReactNode }) {
  const { open } = useAlertDialogContext();

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

export function AlertDialogOverlay(props: HTMLAttributes<HTMLDivElement>) {
  const { onOpenChange } = useAlertDialogContext();

  return (
    <div
      {...props}
      className={cn("absolute inset-0 bg-black/45 backdrop-blur-sm", props.className)}
      onClick={() => onOpenChange(false)}
    />
  );
}

export function AlertDialogContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <AlertDialogPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <AlertDialogOverlay />
        <div
          {...props}
          role="alertdialog"
          aria-modal="true"
          className={cn("relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl", className)}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("flex flex-col gap-2", className)} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 {...props} className={cn("text-lg font-semibold text-foreground", className)} />;
}

export function AlertDialogDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={cn("text-sm leading-relaxed text-foreground-muted", className)} />;
}
