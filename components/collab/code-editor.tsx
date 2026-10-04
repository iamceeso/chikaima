"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import type { Monaco } from "@monaco-editor/react";

import { cn } from "@/lib/utils";
import type { CollabFileChange } from "@/types";

// Monaco touches `window`, so it is only ever loaded in the browser.
const Editor = dynamic(() => import("@monaco-editor/react").then((module) => module.default), { ssr: false, loading: () => <EditorLoading /> });
const DiffEditor = dynamic(() => import("@monaco-editor/react").then((module) => module.DiffEditor), { ssr: false, loading: () => <EditorLoading /> });

function EditorLoading() {
  return <div className="flex h-full min-h-40 items-center justify-center text-xs text-foreground-muted">Loading editor…</div>;
}

const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  vue: "html",
  py: "python",
  php: "php",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  cs: "csharp",
  sql: "sql",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  dockerfile: "dockerfile",
  xml: "xml",
};

export function languageFor(path: string): string {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  return LANGUAGES[name.split(".").at(-1) ?? ""] ?? "plaintext";
}

/** Follows the app's light/dark toggle (a `dark` class on <html>). */
function useDarkMode(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => true,
  );
}

/** Monaco themes matching Chikaima's own surfaces, so the editor doesn't sit in a grey box. */
function defineThemes(monaco: Monaco): void {
  monaco.editor.defineTheme("chikaima-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0d0d0d",
      "editorGutter.background": "#0d0d0d",
      "editor.lineHighlightBackground": "#171717",
      "editorLineNumber.foreground": "#5a5a5a",
      "editorLineNumber.activeForeground": "#a3a3a3",
      "editor.selectionBackground": "#2f8f6755",
      "editorCursor.foreground": "#79c8a7",
      "diffEditor.insertedTextBackground": "#53ab8530",
      "diffEditor.removedTextBackground": "#e5484d30",
      "diffEditor.insertedLineBackground": "#53ab8518",
      "diffEditor.removedLineBackground": "#e5484d18",
    },
  });
  monaco.editor.defineTheme("chikaima-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#f5f7f6",
      "editorGutter.background": "#f5f7f6",
      "editor.lineHighlightBackground": "#edf2ef",
      "editorLineNumber.foreground": "#9aa8a0",
      "editor.selectionBackground": "#2f8f6733",
      "editorCursor.foreground": "#2f8f67",
    },
  });
}

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 12,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
} as const;

export function CodeEditor({ path, value, onChange, onSave, readOnly = false }: { path: string; value: string; onChange?: (value: string) => void; onSave?: () => void; readOnly?: boolean }) {
  const dark = useDarkMode();
  // Monaco binds the save shortcut once, at mount; read the latest handler through a ref.
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);
  return (
    <Editor
      path={path}
      language={languageFor(path)}
      value={value}
      theme={dark ? "chikaima-dark" : "chikaima-light"}
      beforeMount={defineThemes}
      onChange={(next) => onChange?.(next ?? "")}
      onMount={(editor, monaco) => {
        // Cmd/Ctrl+S saves, as in a desktop editor.
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current?.());
      }}
      options={{ ...EDITOR_OPTIONS, readOnly }}
    />
  );
}

/** Side-by-side (or inline) diff of one or more changed files, with a file picker. `height="fill"` takes the parent's full height. */
export function DiffView({ files, height = 420 }: { files: CollabFileChange[]; height?: number | "fill" }) {
  const dark = useDarkMode();
  const [selected, setSelected] = useState(0);
  const [sideBySide, setSideBySide] = useState(true);
  const file = files[Math.min(selected, files.length - 1)];
  if (!file) return <p className="text-xs text-foreground-muted">No file contents to show.</p>;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border", height === "fill" && "flex h-full flex-col")}>
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-background px-2 py-1.5">
        {files.map((entry, index) => (
          <button
            key={entry.path}
            type="button"
            onClick={() => setSelected(index)}
            className={cn("rounded-md px-2 py-0.5 font-mono text-[11px]", index === selected ? "bg-surface text-foreground" : "text-foreground-muted hover:text-foreground")}
          >
            {entry.before === null ? "+ " : entry.after === null ? "− " : ""}
            {entry.path}
          </button>
        ))}
        <button type="button" onClick={() => setSideBySide((value) => !value)} className="ml-auto rounded-md px-2 py-0.5 text-[11px] text-foreground-muted hover:text-foreground">
          {sideBySide ? "Inline" : "Side by side"}
        </button>
      </div>
      <div className={height === "fill" ? "min-h-0 flex-1" : undefined} style={height === "fill" ? undefined : { height }}>
        <DiffEditor
          original={file.before ?? ""}
          modified={file.after ?? ""}
          language={languageFor(file.path)}
          theme={dark ? "chikaima-dark" : "chikaima-light"}
          beforeMount={defineThemes}
          options={{ ...EDITOR_OPTIONS, readOnly: true, renderSideBySide: sideBySide, originalEditable: false }}
        />
      </div>
    </div>
  );
}
