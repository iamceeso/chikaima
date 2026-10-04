"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, FolderClosed, FolderOpen, RefreshCw } from "lucide-react";

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
    const parentPath = entry.path.includes("/") ? entry.path.slice(0, entry.path.lastIndexOf("/")) : "";
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

/**
 * The project's file tree. Files agents touched in the current run carry
 * their marker (the agent's rank), so you can see who is working where.
 */
export function Explorer({
  folder,
  entries,
  truncated,
  activePath,
  touchedBy,
  onOpen,
  onRefresh,
}: {
  folder: string;
  entries: CollabFileEntry[];
  truncated: boolean;
  activePath: string | null;
  touchedBy: Map<string, { rank: number; name: string }>;
  onOpen: (path: string) => void;
  onRefresh: () => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const render = (nodes: TreeNode[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const pad = { paddingLeft: depth * 12 + 8 };
      if (node.type === "dir") {
        const open = !collapsed.has(node.path);
        return (
          <div key={node.path}>
            <button type="button" onClick={() => toggle(node.path)} className="flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[12.5px] text-foreground-muted hover:bg-surface-strong/60 hover:text-foreground" style={pad}>
              {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
              {open ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/80" /> : <FolderClosed className="h-3.5 w-3.5 shrink-0 text-primary/80" />}
              <span className="truncate">{node.name}</span>
            </button>
            {open ? render(node.children, depth + 1) : null}
          </div>
        );
      }
      const agent = touchedBy.get(node.path);
      return (
        <button
          key={node.path}
          type="button"
          onClick={() => onOpen(node.path)}
          title={agent ? `Edited by ${agent.name} in this run` : node.path}
          className={cn(
            "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[12.5px] hover:bg-surface-strong/60",
            node.path === activePath ? "bg-primary/12 text-foreground" : agent ? "text-amber-600 dark:text-amber-400" : "text-foreground-muted hover:text-foreground",
          )}
          style={{ paddingLeft: depth * 12 + 26 }}
        >
          <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
          {agent ? <span className="ml-auto shrink-0 rounded bg-amber-500/15 px-1 text-[10px] font-semibold">#{agent.rank}</span> : null}
        </button>
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground-muted">Explorer</span>
        <button type="button" aria-label="Refresh files" onClick={onRefresh} className="rounded p-1 text-foreground-muted hover:bg-surface-strong hover:text-foreground">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">{folder}</div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tree.length ? render(tree, 0) : <p className="px-4 py-3 text-xs text-foreground-muted">Empty folder. Give the team a task, or create files from the terminal.</p>}
        {truncated ? <p className="px-4 pt-2 text-[11px] text-muted">Listing truncated.</p> : null}
      </div>
    </div>
  );
}
