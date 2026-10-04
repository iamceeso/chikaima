"use client";

import { useCallback, useState } from "react";

function readStored(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(`chikaima-ide-${key}`);
    const value = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * A panel dimension the user can drag, remembered per browser. `direction`
 * is +1 when dragging right/down grows the panel and -1 when it shrinks it
 * (a right-hand or bottom panel).
 */
export function usePanelSize(key: string, initial: number, min: number, max: number, axis: "x" | "y", direction: 1 | -1) {
  const [size, setSize] = useState(() => (typeof window === "undefined" ? initial : Math.min(max, Math.max(min, readStored(key, initial)))));

  const startDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const start = axis === "x" ? event.clientX : event.clientY;
      const startSize = size;
      let latest = startSize;
      const onMove = (move: PointerEvent) => {
        const delta = ((axis === "x" ? move.clientX : move.clientY) - start) * direction;
        latest = Math.min(max, Math.max(min, startSize + delta));
        setSize(latest);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(`chikaima-ide-${key}`, String(Math.round(latest)));
        } catch {
          // storage unavailable: the size just isn't remembered
        }
      };
      document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [axis, direction, key, max, min, size],
  );

  return [size, startDrag] as const;
}

export function ResizeHandle({ axis, onPointerDown }: { axis: "x" | "y"; onPointerDown: (event: React.PointerEvent) => void }) {
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      className={
        axis === "x"
          ? "group relative w-px shrink-0 cursor-col-resize bg-border after:absolute after:inset-y-0 after:-left-1 after:-right-1 hover:bg-primary"
          : "group relative h-px shrink-0 cursor-row-resize bg-border after:absolute after:inset-x-0 after:-top-1 after:-bottom-1 hover:bg-primary"
      }
    />
  );
}
