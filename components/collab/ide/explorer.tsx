"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ChevronsDownUp, FileCode2, FilePlus2, FolderClosed, FolderOpen, FolderPlus, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CollabFileEntry } from "@/types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children: TreeNode[];
}

function buildTree(entries: CollabFileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const byPath = new Map<string, TreeNode>([["", root]]);
  for (const entry of entries) {
    const parentPath = parentOf(entry.path);
    const node: TreeNode = { name: entry.path.split("/").at(-1)!, path: entry.path, type: entry.type, children: [] };
    byPath.set(entry.path, node);
    (byPath.get(parentPath) ?? root).children.push(node);
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

function parentOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** `path` with the `from` prefix swapped for `to`, or null when `path` isn't `from` or inside it. */
export function remapPath(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return null;
}

/**
 * The project's file tree. Files agents touched in the current run carry
 * their marker (the agent's rank), so you can see who is working where.
 */
export interface AgentFileMark {
  name: string;
  /** The agent is working on this file right now (vs. changed it earlier in the run). */
  editing: boolean;
}

const GIT_MARK: Record<string, { letter: string; className: string; title: string }> = {
  M: { letter: "M", className: "text-amber-600 dark:text-amber-400", title: "Modified" },
  A: { letter: "A", className: "text-emerald-600 dark:text-emerald-400", title: "Added" },
  "?": { letter: "U", className: "text-emerald-600 dark:text-emerald-400", title: "New file (untracked)" },
  R: { letter: "R", className: "text-sky-600 dark:text-sky-400", title: "Renamed" },
};

/** The explorer's inline name box: creating an entry inside `parent`, or renaming `path`. */
type Editing = { mode: "file" | "dir"; parent: string } | { mode: "rename"; path: string; type: "file" | "dir" };

interface MenuState {
  x: number;
  y: number;
  /** Null for the folder root (right-click on empty space). */
  node: TreeNode | null;
}

type MenuItem = { label: string; shortcut?: string; disabled?: boolean; action: () => void } | "separator";

const iconButton = "rounded p-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";

export function Explorer({
  folder,
  entries,
  truncated,
  activePath,
  agentFiles,
  gitStatus,
  readOnly,
  onOpen,
  onRefresh,
  onCreate,
  onRename,
  onDelete,
}: {
  folder: string;
  entries: CollabFileEntry[];
  truncated: boolean;
  activePath: string | null;
  agentFiles: Map<string, AgentFileMark>;
  gitStatus: Map<string, string>;
  /** Agents are working in the folder: file management is paused. */
  readOnly: boolean;
  onOpen: (path: string) => void;
  onRefresh: () => void;
  onCreate: (path: string, type: "file" | "dir") => Promise<void>;
  onRename: (from: string, to: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const types = useMemo(() => new Map(entries.map((entry) => [entry.path, entry.type])), [entries]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const expand = (path: string) =>
    setCollapsed((current) => {
      if (!path) return current;
      const next = new Set(current);
      for (let dir = path; dir; dir = parentOf(dir)) next.delete(dir);
      return next;
    });

  /** The folder new entries go in: the node itself for a folder, its parent for a file. */
  const targetDir = (path: string | null) => (path === null ? "" : types.get(path) === "dir" ? path : parentOf(path));

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    }
  };

  const startCreate = (mode: "file" | "dir", parent: string) => {
    if (readOnly) return;
    expand(parent);
    setError(null);
    setEditing({ mode, parent });
  };
  const startRename = (path: string) => {
    if (readOnly) return;
    setError(null);
    setEditing({ mode: "rename", path, type: types.get(path) ?? "file" });
  };
  const remove = async (path: string) => {
    if (readOnly) return;
    const name = path.split("/").at(-1);
    const isDir = types.get(path) === "dir";
    if (!window.confirm(isDir ? `Delete the folder '${name}' and all of its contents?` : `Delete '${name}'?`)) return;
    if (await run(() => onDelete(path))) {
      if (selected && remapPath(selected, path, "") !== null) setSelected(null);
    }
  };
  const move = async (from: string, to: string) => {
    if (to === from) return;
    if (await run(() => onRename(from, to))) {
      setCollapsed((current) => new Set([...current].map((path) => remapPath(path, from, to) ?? path)));
      setSelected(to);
    }
  };

  /** Commits the inline name box. Resolves false to keep it open (on an error). */
  const commitEditing = async (value: string): Promise<boolean> => {
    if (!editing) return true;
    const name = value.trim().replace(/^\/+|\/+$/g, "");
    if (editing.mode === "rename") {
      const to = joinPath(parentOf(editing.path), name);
      if (name && to !== editing.path) {
        if (!(await run(() => onRename(editing.path, to)))) return false;
        setCollapsed((current) => new Set([...current].map((path) => remapPath(path, editing.path, to) ?? path)));
        setSelected(to);
      }
    } else if (name) {
      const path = joinPath(editing.parent, name);
      if (!(await run(() => onCreate(path, editing.mode)))) return false;
      expand(parentOf(path));
      setSelected(path);
    }
    setEditing(null);
    treeRef.current?.focus({ preventScroll: true });
    return true;
  };

  const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => undefined);

  const menuItems = (node: TreeNode | null): MenuItem[] => {
    const dir = targetDir(node?.path ?? null);
    const items: MenuItem[] = [];
    if (node?.type === "file") items.push({ label: "Open", action: () => onOpen(node.path) }, "separator");
    items.push(
      { label: "New File…", disabled: readOnly, action: () => startCreate("file", dir) },
      { label: "New Folder…", disabled: readOnly, action: () => startCreate("dir", dir) },
    );
    if (node) {
      items.push(
        "separator",
        { label: "Copy Name", action: () => copy(node.name) },
        { label: "Copy Relative Path", action: () => copy(node.path) },
        { label: "Copy Path", action: () => copy(`${folder}/${node.path}`) },
        "separator",
        { label: "Rename…", shortcut: "F2", disabled: readOnly, action: () => startRename(node.path) },
        { label: "Delete", shortcut: "⌫", disabled: readOnly, action: () => void remove(node.path) },
      );
    } else {
      items.push("separator", { label: "Collapse Folders", action: () => setCollapsed(new Set(entries.filter((e) => e.type === "dir").map((e) => e.path))) }, { label: "Refresh", action: onRefresh });
    }
    return items;
  };

  const openMenu = (event: React.MouseEvent, node: TreeNode | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (node) setSelected(node.path);
    setMenu({ x: event.clientX, y: event.clientY, node });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing || !selected || event.target !== treeRef.current) return;
    if (event.key === "F2" || (event.key === "Enter" && event.metaKey)) {
      event.preventDefault();
      startRename(selected);
    } else if (event.key === "Delete" || (event.key === "Backspace" && (event.metaKey || event.ctrlKey))) {
      event.preventDefault();
      void remove(selected);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (types.get(selected) === "dir") toggle(selected);
      else onOpen(selected);
    }
  };

  // Drag a row onto a folder (or empty space, for the root) to move it there.
  const dragProps = (node: TreeNode) => ({
    draggable: !readOnly && !editing,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData("application/x-chikaima-path", node.path);
      event.dataTransfer.effectAllowed = "move";
    },
  });
  const dropProps = (dir: string) => ({
    onDragOver: (event: React.DragEvent) => {
      if (readOnly || !event.dataTransfer.types.includes("application/x-chikaima-path")) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(dir);
    },
    onDragLeave: () => setDropTarget((current) => (current === dir ? null : current)),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDropTarget(null);
      const from = event.dataTransfer.getData("application/x-chikaima-path");
      if (!from || from === dir || dir.startsWith(`${from}/`) || parentOf(from) === dir) return;
      void move(from, joinPath(dir, from.split("/").at(-1)!));
    },
  });

  const nameBox = (depth: number, type: "file" | "dir", initial: string) => (
    <NameBox key="__editing" depth={depth} type={type} initial={initial} error={error} onCommit={commitEditing} onCancel={() => (setEditing(null), setError(null))} />
  );

  const render = (nodes: TreeNode[], depth: number, parent: string): React.ReactNode => {
    const creating = editing && editing.mode !== "rename" && editing.parent === parent ? nameBox(depth, editing.mode, "") : null;
    const rows = nodes.map((node) => {
      if (editing?.mode === "rename" && editing.path === node.path) {
        return (
          <div key={node.path}>
            {nameBox(depth, node.type, node.name)}
            {node.type === "dir" && !collapsed.has(node.path) ? render(node.children, depth + 1, node.path) : null}
          </div>
        );
      }
      const isSelected = selected === node.path;
      if (node.type === "dir") {
        const open = !collapsed.has(node.path);
        return (
          <div key={node.path} {...dropProps(node.path)} className={cn(dropTarget === node.path && "bg-primary/10")}>
            <button
              type="button"
              {...dragProps(node)}
              onClick={() => (setSelected(node.path), toggle(node.path))}
              onContextMenu={(event) => openMenu(event, node)}
              tabIndex={-1}
              className={cn(
                "flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[12.5px] text-foreground-muted hover:bg-surface-strong/60 hover:text-foreground",
                isSelected && "bg-surface-strong/80 text-foreground",
              )}
              style={{ paddingLeft: depth * 12 + 8 }}
            >
              {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" /> : <FolderClosed className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
              <span className="truncate">{node.name}</span>
            </button>
            {open ? render(node.children, depth + 1, node.path) : null}
          </div>
        );
      }
      const agent = agentFiles.get(node.path);
      const code = gitStatus.get(node.path)?.trim()[0];
      const git = code ? GIT_MARK[code] : undefined;
      return (
        <button
          key={node.path}
          type="button"
          {...dragProps(node)}
          onClick={() => (setSelected(node.path), onOpen(node.path))}
          onContextMenu={(event) => openMenu(event, node)}
          tabIndex={-1}
          title={[node.path, git?.title, agent ? `${agent.name} · ${agent.editing ? "editing now" : "modified this task"}` : null].filter(Boolean).join(" — ")}
          className={cn(
            "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[12.5px] hover:bg-surface-strong/60",
            node.path === activePath ? "bg-primary/12 text-foreground" : git ? git.className : "text-foreground-muted hover:text-foreground",
            isSelected && node.path !== activePath && "bg-surface-strong/80",
          )}
          style={{ paddingLeft: depth * 12 + 26 }}
        >
          <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="min-w-12 shrink-0 truncate">{node.name}</span>
          {agent ? (
            <span className={cn("ml-auto flex min-w-0 items-center gap-1 truncate text-[10.5px]", agent.editing ? "text-emerald-600 dark:text-emerald-400" : "text-muted")}>
              {agent.editing ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
              {agent.name} · {agent.editing ? "editing" : "modified"}
            </span>
          ) : null}
          {git ? <span className={cn("shrink-0 font-mono text-[10.5px] font-semibold", !agent && "ml-auto", git.className)}>{git.letter}</span> : null}
        </button>
      );
    });
    // Like VS Code, the new entry's box sits at the top of its folder.
    return (
      <>
        {creating}
        {rows}
      </>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">Explorer</span>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="New file" title="New File…" disabled={readOnly} onClick={() => startCreate("file", targetDir(selected))} className={iconButton}>
            <FilePlus2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="New folder" title="New Folder…" disabled={readOnly} onClick={() => startCreate("dir", targetDir(selected))} className={iconButton}>
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Refresh files" title="Refresh" onClick={onRefresh} className={iconButton}>
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Collapse folders"
            title="Collapse Folders"
            onClick={() => setCollapsed(new Set(entries.filter((entry) => entry.type === "dir").map((entry) => entry.path)))}
            className={iconButton}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">{folder}</div>
      {readOnly ? <p className="px-3 pb-1 text-[11px] text-amber-600">Agents are working; file changes are paused.</p> : null}
      {error && !editing ? (
        <button type="button" onClick={() => setError(null)} className="mx-3 mb-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-left text-[11px] text-destructive">
          {error}
        </button>
      ) : null}
      <div
        ref={treeRef}
        tabIndex={0}
        role="tree"
        aria-label="Files"
        onKeyDown={onKeyDown}
        onContextMenu={(event) => openMenu(event, null)}
        onClick={(event) => event.target === event.currentTarget && setSelected(null)}
        {...dropProps("")}
        className={cn("min-h-0 flex-1 overflow-y-auto pb-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/40", dropTarget === "" && "bg-primary/5")}
        onMouseDown={(event) => {
          // Keep keyboard shortcuts working after clicking a row.
          if (!(event.target instanceof HTMLInputElement)) requestAnimationFrame(() => treeRef.current?.focus({ preventScroll: true }));
        }}
      >
        {tree.length || editing ? render(tree, 0, "") : <p className="px-4 py-3 text-xs text-foreground-muted">Empty folder. Right-click to create a file, or give the team a task.</p>}
        {truncated ? <p className="px-4 pt-2 text-[11px] text-muted">Listing truncated.</p> : null}
      </div>
      {menu ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

/** Inline name input for a new or renamed entry. Enter or blur commits, Escape cancels. */
function NameBox({
  depth,
  type,
  initial,
  error,
  onCommit,
  onCancel,
}: {
  depth: number;
  type: "file" | "dir";
  initial: string;
  error: string | null;
  onCommit: (value: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  // Busy while a commit is in flight; done once committed or cancelled, so the blur from unmounting is ignored.
  const busy = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Select the name without its extension, like VS Code.
    const dot = type === "file" ? initial.lastIndexOf(".") : -1;
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, type]);

  const commit = async () => {
    if (busy.current || done.current) return;
    busy.current = true;
    done.current = await onCommit(value);
    busy.current = false;
  };
  const cancel = () => {
    if (done.current) return;
    done.current = true;
    onCancel();
  };

  const Icon = type === "dir" ? FolderClosed : FileCode2;
  return (
    <div className="relative py-[2px] pr-2" style={{ paddingLeft: depth * 12 + (type === "dir" ? 22 : 26) }}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", type === "dir" ? "text-primary/80" : "opacity-70")} />
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          aria-label={type === "dir" ? "Folder name" : "File name"}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") void commit();
            else if (event.key === "Escape") cancel();
          }}
          // Clicking away from a name that was refused gives up on it, as in VS Code.
          onBlur={() => (error ? cancel() : void commit())}
          className={cn("h-5 min-w-0 flex-1 rounded-sm border bg-background px-1 text-[12.5px] text-foreground outline-none", error ? "border-destructive" : "border-primary")}
        />
      </div>
      {error ? <p className="mt-0.5 rounded-sm bg-destructive px-1.5 py-0.5 text-[11px] text-white">{error}</p> : null}
    </div>
  );
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
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
            className="flex w-full items-center justify-between gap-6 px-3 py-1 text-left hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-foreground"
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
