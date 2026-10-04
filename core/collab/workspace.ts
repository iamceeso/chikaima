import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

import { getConfig } from "../config/index.js";
import { badRequest } from "../errors.js";

const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_LIST_ENTRIES = 400;
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build", ".venv", "__pycache__", ".chikaima"]);

export interface FileChange {
  path: string;
  /** Content before the first edit in this changeset; null when the file did not exist. */
  before: string | null;
  /** Current content; null when the file has been deleted. */
  after: string | null;
}

function collabRoot(): string {
  const root = resolve(getConfig().collabRoot);
  mkdirSync(root, { recursive: true });
  return realpathSync(root);
}

function isWithin(root: string, target: string): boolean {
  return target === root || target.startsWith(root + sep);
}

/**
 * Validates a team folder name (a path relative to the collaboration root)
 * and returns it normalised. Rejects anything that would escape the root.
 */
export function normalizeTeamFolder(folder: string): string {
  let trimmed = folder.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  // A full path is fine as long as it points inside the projects root: keep the part below the root.
  if (isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
    const root = collabRoot();
    const absolute = resolve(trimmed);
    if (!isWithin(root, absolute) || absolute === root) {
      throw badRequest(`Choose a folder inside the projects root (${root}). To work on code elsewhere, set CHIKAIMA_COLLAB_ROOT to a parent folder such as ~/Projects.`);
    }
    trimmed = relative(root, absolute).split(sep).join("/");
  }
  trimmed = trimmed.replace(/^\.\/+/, "");
  if (!trimmed) {
    throw badRequest("Choose a folder for the project.");
  }
  const normalized = normalize(trimmed).replace(/\\/g, "/");
  if (normalized === "." || normalized.split("/").some((segment) => segment === ".." || segment === ".git")) {
    throw badRequest("The folder must stay inside the projects root.");
  }
  if (normalized.split("/")[0] === ".chikaima") {
    throw badRequest("The .chikaima directory is reserved.");
  }
  return normalized;
}

/**
 * A team's folder, as seen by its models. Every path is resolved relative
 * to the folder and refused if it escapes it (including via symlinks) or
 * touches `.git`. Writes and deletes are recorded in a changeset so a
 * rejected step can be put back exactly as it was.
 */
export class Workspace {
  readonly root: string;
  private changeset = new Map<string, string | null>();

  private constructor(root: string) {
    this.root = root;
  }

  /** A workspace over an existing directory inside the collaboration root, such as a step's git worktree. */
  static at(root: string): Workspace {
    const real = realpathSync(root);
    if (!isWithin(collabRoot(), real)) throw badRequest("Workspace must stay inside the collaboration root.");
    return new Workspace(real);
  }

  static open(folder: string): Workspace {
    const base = collabRoot();
    const target = resolve(base, normalizeTeamFolder(folder));
    mkdirSync(target, { recursive: true });
    const real = realpathSync(target);
    if (!isWithin(base, real)) {
      throw badRequest("Folder must stay inside the collaboration root.");
    }
    return new Workspace(real);
  }

  /** Resolves a model-supplied path to an absolute path inside the folder, or throws. */
  resolvePath(path: string): { absolute: string; relative: string } {
    const cleaned = String(path ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "") || ".";
    if (isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) {
      throw badRequest(`Path must be relative to the workspace: ${path}`);
    }
    const absolute = resolve(this.root, cleaned);
    if (!isWithin(this.root, absolute)) {
      throw badRequest(`Path escapes the workspace: ${path}`);
    }
    const rel = relative(this.root, absolute).split(sep).join("/");
    if (rel.split("/").includes(".git")) {
      throw badRequest(`The .git directory is off limits: ${path}`);
    }

    // Follow symlinks on the deepest existing ancestor so a link can't point outside the folder.
    let probe = absolute;
    while (!existsSync(probe) && probe !== this.root) probe = dirname(probe);
    if (!isWithin(this.root, realpathSync(probe))) {
      throw badRequest(`Path escapes the workspace: ${path}`);
    }
    return { absolute, relative: rel || "." };
  }

  /** Files and directories under `path`, depth-first, skipping dependency/VCS directories. Capped at MAX_LIST_ENTRIES. */
  entries(path = "."): { entries: Array<{ path: string; type: "file" | "dir" }>; truncated: boolean } {
    const { absolute, relative: rel } = this.resolvePath(path);
    if (!existsSync(absolute) || !statSync(absolute).isDirectory()) {
      throw badRequest(`Not a directory: ${path}`);
    }
    const entries: Array<{ path: string; type: "file" | "dir" }> = [];
    let truncated = false;
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entries.length >= MAX_LIST_ENTRIES) {
          truncated = true;
          return;
        }
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
        const display = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          entries.push({ path: display, type: "dir" });
          walk(join(dir, entry.name), display);
        } else if (entry.isFile()) {
          entries.push({ path: display, type: "file" });
        }
      }
    };
    walk(absolute, rel === "." ? "" : rel);
    return { entries, truncated };
  }

  /** The folder as a text tree, for prompts. */
  list(path = "."): string {
    const { entries, truncated } = this.entries(path);
    const lines = entries.map((entry) => (entry.type === "dir" ? `${entry.path}/` : entry.path));
    if (truncated) lines.push(`… (listing truncated at ${MAX_LIST_ENTRIES} entries)`);
    return lines.length > 0 ? lines.join("\n") : "(empty)";
  }

  read(path: string): string {
    const { absolute } = this.resolvePath(path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw badRequest(`File not found: ${path}`);
    }
    if (statSync(absolute).size > MAX_READ_BYTES) {
      throw badRequest(`File is too large to read (over ${MAX_READ_BYTES / 1024} KB): ${path}`);
    }
    const content = readFileSync(absolute, "utf8");
    if (content.includes("\0")) {
      throw badRequest(`Binary files cannot be read: ${path}`);
    }
    return content;
  }

  write(path: string, content: string): void {
    const { absolute, relative: rel } = this.resolvePath(path);
    if (rel === ".") throw badRequest("A file path is required.");
    if (Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
      throw badRequest(`File content is too large (over ${MAX_WRITE_BYTES / 1024} KB): ${path}`);
    }
    if (existsSync(absolute) && !lstatSync(absolute).isFile()) {
      throw badRequest(`Not a regular file: ${path}`);
    }
    this.snapshot(rel, absolute);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }

  delete(path: string): void {
    const { absolute, relative: rel } = this.resolvePath(path);
    if (!existsSync(absolute) || !lstatSync(absolute).isFile()) {
      throw badRequest(`File not found: ${path}`);
    }
    this.snapshot(rel, absolute);
    rmSync(absolute);
  }

  // --- human file management (explorer), not part of the changeset ---------------

  /** Creates an empty file or a directory (with any missing parents). Refuses to replace anything that exists. */
  create(path: string, type: "file" | "dir"): string {
    const { absolute, relative: rel } = this.resolvePath(path);
    if (rel === ".") throw badRequest("A name is required.");
    if (existsSync(absolute)) throw badRequest(`${rel} already exists.`);
    if (type === "dir") {
      mkdirSync(absolute, { recursive: true });
    } else {
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, "", { encoding: "utf8", flag: "wx" });
    }
    return rel;
  }

  /** Renames or moves a file or directory. The destination must not exist. */
  rename(from: string, to: string): string {
    const source = this.resolvePath(from);
    const target = this.resolvePath(to);
    if (source.relative === "." || target.relative === ".") throw badRequest("A name is required.");
    if (!existsSync(source.absolute)) throw badRequest(`Not found: ${from}`);
    if (source.relative === target.relative) return target.relative;
    if (target.relative.startsWith(`${source.relative}/`)) throw badRequest("A folder can't be moved inside itself.");
    // Allow a case-only rename on case-insensitive file systems, where the "existing" target is the source itself.
    if (existsSync(target.absolute) && source.relative.toLowerCase() !== target.relative.toLowerCase()) {
      throw badRequest(`${target.relative} already exists.`);
    }
    mkdirSync(dirname(target.absolute), { recursive: true });
    renameSync(source.absolute, target.absolute);
    return target.relative;
  }

  /** Deletes a file, or a directory and everything in it. */
  remove(path: string): void {
    const { absolute, relative: rel } = this.resolvePath(path);
    if (rel === ".") throw badRequest("The project folder itself can't be deleted.");
    if (!existsSync(absolute)) throw badRequest(`Not found: ${path}`);
    rmSync(absolute, { recursive: true, force: true });
  }

  /** Files touched since the last `commit()`/`revert()`, with their original and current content. Unchanged files are omitted. */
  changes(): FileChange[] {
    const result: FileChange[] = [];
    for (const [path, before] of this.changeset) {
      const absolute = resolve(this.root, path);
      const after = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
      if (after !== before) result.push({ path, before, after });
    }
    return result.sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Accepts the current changeset: the edits stay and stop being revertable. */
  commit(): void {
    this.changeset.clear();
  }

  /** Puts every file touched since the last commit back as it was. */
  revert(): void {
    for (const [path, before] of this.changeset) {
      const absolute = resolve(this.root, path);
      if (before === null) {
        rmSync(absolute, { force: true });
      } else {
        mkdirSync(dirname(absolute), { recursive: true });
        writeFileSync(absolute, before, "utf8");
      }
    }
    this.changeset.clear();
  }

  private snapshot(rel: string, absolute: string): void {
    if (this.changeset.has(rel)) return;
    this.changeset.set(rel, existsSync(absolute) ? readFileSync(absolute, "utf8") : null);
  }
}

const DIFF_CONTEXT = 3;
const MAX_DIFF_LINES = 4000;

/** Unified diff of one file change, for reviewers. Falls back to the full new content when the file is too large to diff. */
export function unifiedDiff(change: FileChange): string {
  const header = `--- ${change.before === null ? "/dev/null" : `a/${change.path}`}\n+++ ${change.after === null ? "/dev/null" : `b/${change.path}`}`;
  const a = change.before === null ? [] : change.before.split("\n");
  const b = change.after === null ? [] : change.after.split("\n");
  if (a.length + b.length > MAX_DIFF_LINES) {
    return `${header}\n(file too large to diff; new content follows)\n${change.after ?? "(deleted)"}`;
  }

  // Longest-common-subsequence table, walked forwards to emit edit operations.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const ops: Array<{ type: " " | "-" | "+"; line: string; aIndex: number; bIndex: number }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ type: " ", line: a[i]!, aIndex: i++, bIndex: j++ });
    } else if (i < a.length && (j >= b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      ops.push({ type: "-", line: a[i]!, aIndex: i++, bIndex: j });
    } else {
      ops.push({ type: "+", line: b[j]!, aIndex: i, bIndex: j++ });
    }
  }

  const hunks: string[] = [];
  let index = 0;
  while (index < ops.length) {
    if (ops[index]!.type === " ") {
      index++;
      continue;
    }
    const start = Math.max(0, index - DIFF_CONTEXT);
    let end = index;
    let quiet = 0;
    while (end < ops.length && quiet <= DIFF_CONTEXT * 2) {
      quiet = ops[end]!.type === " " ? quiet + 1 : 0;
      end++;
    }
    end = Math.min(ops.length, end - Math.max(0, quiet - DIFF_CONTEXT));
    const slice = ops.slice(start, end);
    const aCount = slice.filter((op) => op.type !== "+").length;
    const bCount = slice.filter((op) => op.type !== "-").length;
    const aStart = aCount === 0 ? slice[0]!.aIndex : slice[0]!.aIndex + 1;
    const bStart = bCount === 0 ? slice[0]!.bIndex : slice[0]!.bIndex + 1;
    hunks.push(`@@ -${aStart},${aCount} +${bStart},${bCount} @@\n${slice.map((op) => `${op.type}${op.line}`).join("\n")}`);
    index = end;
  }
  return hunks.length > 0 ? `${header}\n${hunks.join("\n")}` : header;
}

export interface FolderListing {
  /** The projects root as an absolute path on the server. */
  root: string;
  /** The listed folder, relative to the root ("" for the root itself). */
  path: string;
  parent: string | null;
  folders: Array<{ name: string; path: string; isGit: boolean }>;
}

/** Subfolders of a folder inside the projects root, for the folder picker. Hidden folders and dependency directories are skipped. */
export function listFolders(path = ""): FolderListing {
  const root = collabRoot();
  const relativePath = path.trim() ? normalizeTeamFolder(path) : "";
  const absolute = resolve(root, relativePath);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) throw badRequest(`Not a folder: ${relativePath || "/"}`);
  const real = realpathSync(absolute);
  if (!isWithin(root, real)) throw badRequest("The folder must stay inside the projects root.");

  const folders = readdirSync(real, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !IGNORED_DIRS.has(entry.name))
    .map((entry) => {
      const child = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      return { name: entry.name, path: child, isGit: existsSync(join(real, entry.name, ".git")) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    root,
    path: relativePath,
    parent: relativePath ? (relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "") : null,
    folders,
  };
}
