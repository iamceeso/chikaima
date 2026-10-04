"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

export type MenuItem = { label: string; shortcut?: string; disabled?: boolean; danger?: boolean; action: () => void } | "separator";

/** A right-click menu at (x, y), kept on screen. Closes on a click elsewhere, Escape, scroll, resize or window blur. */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu on screen.
  useEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("contextmenu", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("contextmenu", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="fixed z-100 min-w-52 rounded-md border border-border bg-surface py-1 text-[12.5px] text-foreground shadow-xl"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item === "separator" ? (
          <div key={`sep-${index}`} className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.action();
            }}
            className={cn(
              "flex w-full items-center justify-between gap-6 px-3 py-1 text-left disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground",
              item.danger ? "text-destructive hover:bg-destructive hover:text-white" : "hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <span>{item.label}</span>
            {item.shortcut ? <span className="text-[11px] opacity-60">{item.shortcut}</span> : null}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
