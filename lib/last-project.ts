"use client";

import { useSyncExternalStore } from "react";

const KEY = "chikaima-last-project";
const EVENT = "chikaima-last-project-change";

/** Remembers the project last opened in this browser, so global navigation (Workspace, AI Team, Tasks) can return to it. */
export function setLastProject(projectId: string): void {
  try {
    if (window.localStorage.getItem(KEY) === projectId) return;
    window.localStorage.setItem(KEY, projectId);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage unavailable: navigation just falls back to the projects list
  }
}

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function useLastProject(): string | null {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener(EVENT, onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    read,
    () => null,
  );
}
