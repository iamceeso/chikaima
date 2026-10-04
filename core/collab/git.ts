import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { badRequest } from "../errors.js";

const AGENT_AUTHOR = ["-c", "user.name=Chikaima Agents", "-c", "user.email=agents@chikaima.local"];
const MAX_BUFFER = 32 * 1024 * 1024;
/** Written when Chikaima turns a folder into a repository, so dependencies, build output and secrets are never committed. */
const DEFAULT_GITIGNORE = ["node_modules/", ".next/", "dist/", "build/", "coverage/", ".venv/", "__pycache__/", ".env", ".env.*", ".DS_Store", ""].join("\n");

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git with an argument list (never a shell string), so model- or user-supplied text can't be interpreted as shell syntax. */
export function git(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, maxBuffer: MAX_BUFFER, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", LC_ALL: "C" } }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number" ? Number((error as { code: number }).code) : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function ok(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args);
  if (result.code !== 0) {
    throw badRequest(`git ${args[0]} failed: ${(result.stderr || result.stdout).trim() || `exit ${result.code}`}`);
  }
  return result.stdout;
}

export interface GitStatusEntry {
  path: string;
  /** Two-letter porcelain code, e.g. " M", "??", "A ". */
  code: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
  files: number;
  additions: number;
  deletions: number;
}

/**
 * Git operations on a team folder. The folder is the source of truth for
 * code; git gives every agent step a commit, every run a branch, and the
 * supervisor a real history to inspect, revert, and merge.
 */
export class GitRepo {
  constructor(readonly root: string) {}

  isRepo(): boolean {
    return existsSync(join(this.root, ".git"));
  }

  /** Makes the folder a repository with an initial commit of whatever is already there. */
  async ensureRepo(): Promise<boolean> {
    if (this.isRepo()) return false;
    await ok(this.root, ["init", "-q"]);
    if (!existsSync(join(this.root, ".gitignore"))) writeFileSync(join(this.root, ".gitignore"), DEFAULT_GITIGNORE);
    await ok(this.root, ["add", "-A"]);
    await ok(this.root, [...AGENT_AUTHOR, "commit", "-q", "--allow-empty", "-m", "Initial snapshot (Chikaima)"]);
    return true;
  }

  async currentBranch(): Promise<string> {
    const branch = (await ok(this.root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch === "HEAD") throw badRequest("The folder's git checkout is in detached HEAD state; check out a branch first.");
    return branch;
  }

  async head(): Promise<string> {
    return (await ok(this.root, ["rev-parse", "HEAD"])).trim();
  }

  async status(): Promise<GitStatusEntry[]> {
    const out = await ok(this.root, ["status", "--porcelain=v1", "-uall", "-z"]);
    const entries: GitStatusEntry[] = [];
    const parts = out.split("\0").filter(Boolean);
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index]!;
      const code = part.slice(0, 2);
      entries.push({ code, path: part.slice(3) });
      // Renames carry the original path as the next NUL-separated field.
      if (code.startsWith("R") || code.startsWith("C")) index++;
    }
    return entries;
  }

  async isDirty(): Promise<boolean> {
    return (await this.status()).length > 0;
  }

  async branches(): Promise<string[]> {
    return (await ok(this.root, ["branch", "--format=%(refname:short)"]))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async createBranch(name: string, from = "HEAD"): Promise<void> {
    await ok(this.root, ["branch", name, from]);
  }

  async checkout(branch: string): Promise<void> {
    await ok(this.root, ["checkout", "-q", branch]);
  }

  /** Stages everything and commits. Returns the new commit hash, or null when there was nothing to commit. */
  async commitAll(message: string, author: "agent" | "user" = "agent"): Promise<string | null> {
    await ok(this.root, ["add", "-A"]);
    if ((await git(this.root, ["diff", "--cached", "--quiet"])).code === 0) return null;
    const identity = author === "agent" ? AGENT_AUTHOR : [];
    await ok(this.root, [...identity, "commit", "-q", "-m", message]);
    return this.head();
  }

  /** Recent commits with their size (files changed, lines added/removed). */
  async log(limit = 30, ref = "HEAD"): Promise<GitCommit[]> {
    const out = await git(this.root, ["log", `-${limit}`, "--numstat", "--format=%x1e%H%x1f%h%x1f%s%x1f%an%x1f%aI", ref]);
    if (out.code !== 0) return [];
    return out.stdout
      .split("\x1e")
      .filter((chunk) => chunk.trim())
      .map((chunk) => {
        const [header, ...stats] = chunk.split("\n");
        const [hash, shortHash, subject, author, date] = header!.split("\x1f");
        let files = 0;
        let additions = 0;
        let deletions = 0;
        for (const line of stats) {
          const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
          if (!match) continue;
          files++;
          additions += match[1] === "-" ? 0 : Number(match[1]);
          deletions += match[2] === "-" ? 0 : Number(match[2]);
        }
        return { hash: hash!, shortHash: shortHash!, subject: subject!, author: author!, date: date!, files, additions, deletions };
      });
  }

  /** The `origin` remote's URL, if the project came from a repository. */
  async remoteUrl(): Promise<string | null> {
    const out = await git(this.root, ["remote", "get-url", "origin"]);
    return out.code === 0 ? out.stdout.trim() || null : null;
  }

  /**
   * Files that differ between two refs (`base...head`: what `head` added since
   * they diverged), with content on each side for the side-by-side review.
   */
  async compare(base: string, head: string, maxBytes = 512 * 1024): Promise<Array<{ path: string; before: string | null; after: string | null }>> {
    const refs = await this.branches();
    for (const ref of [base, head]) if (!refs.includes(ref)) throw badRequest(`Unknown branch: ${ref}`);
    const mergeBase = (await ok(this.root, ["merge-base", base, head])).trim();
    const names = (await ok(this.root, ["diff", "--name-only", "-z", "--no-renames", mergeBase, head])).split("\0").filter(Boolean);
    const files: Array<{ path: string; before: string | null; after: string | null }> = [];
    let budget = maxBytes;
    for (const path of names) {
      const before = await this.fileAt(mergeBase, path);
      const after = await this.fileAt(head, path);
      budget -= (before?.length ?? 0) + (after?.length ?? 0);
      if (budget < 0) break;
      files.push({ path, before, after });
    }
    return files;
  }

  /** Files changed by one commit, with their content before and after, for the side-by-side diff view. */
  async commitFiles(hash: string, maxBytes = 512 * 1024): Promise<Array<{ path: string; before: string | null; after: string | null }>> {
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw badRequest("Invalid commit hash.");
    const parents = (await ok(this.root, ["rev-list", "--parents", "-n", "1", hash])).trim().split(" ").slice(1);
    const names = (await ok(this.root, ["show", "--name-only", "--format=", "-z", "--no-renames", hash])).split("\0").filter(Boolean);
    const files: Array<{ path: string; before: string | null; after: string | null }> = [];
    let budget = maxBytes;
    for (const path of names) {
      const before = parents[0] ? await this.fileAt(parents[0], path) : null;
      const after = await this.fileAt(hash, path);
      budget -= (before?.length ?? 0) + (after?.length ?? 0);
      if (budget < 0) break;
      files.push({ path, before, after });
    }
    return files;
  }

  async fileAt(ref: string, path: string): Promise<string | null> {
    const result = await git(this.root, ["show", `${ref}:${path}`]);
    return result.code === 0 ? result.stdout : null;
  }

  /** Throws away every uncommitted change, including untracked files (ignored files such as node_modules are kept). */
  async discardChanges(): Promise<void> {
    await ok(this.root, ["reset", "-q", "--hard", "HEAD"]);
    await ok(this.root, ["clean", "-q", "-fd"]);
  }

  /** Number of commits on `branch` that aren't on `base`. */
  async commitsAhead(base: string, branch: string): Promise<number> {
    const out = await git(this.root, ["rev-list", "--count", `${base}..${branch}`]);
    return out.code === 0 ? Number.parseInt(out.stdout.trim(), 10) || 0 : 0;
  }

  /** Merges `branch` into the current branch. On conflict the merge is aborted and false is returned. */
  async merge(branch: string, message: string): Promise<boolean> {
    const result = await git(this.root, [...AGENT_AUTHOR, "merge", "--no-ff", "-m", message, branch]);
    if (result.code === 0) return true;
    await git(this.root, ["merge", "--abort"]);
    return false;
  }

  async addWorktree(path: string, branch: string, from: string): Promise<void> {
    await ok(this.root, ["worktree", "add", "-q", "-b", branch, path, from]);
  }

  async removeWorktree(path: string): Promise<void> {
    await git(this.root, ["worktree", "remove", "--force", path]);
    await git(this.root, ["worktree", "prune"]);
  }

  async deleteBranch(name: string): Promise<void> {
    await git(this.root, ["branch", "-D", name]);
  }
}
