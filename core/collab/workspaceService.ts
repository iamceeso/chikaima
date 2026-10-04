import type { ChikaimaDatabase } from "../db/client.js";
import { badRequest, conflict } from "../errors.js";
import { CollabService } from "./collabService.js";
import type { CommandResult } from "./commands.js";
import { GitRepo, type GitCommit, type GitStatusEntry } from "./git.js";
import { getPreviewManager, type PreviewInfo } from "./preview.js";
import { getExecutor, type Executor } from "./sandbox.js";
import { Workspace } from "./workspace.js";

const TERMINAL_TIMEOUT_MS = 10 * 60_000;
const DEPLOY_TIMEOUT_MS = 15 * 60_000;

export interface StreamHandlers {
  onOutput: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface GitOverview {
  is_repo: boolean;
  branch: string | null;
  branches: string[];
  changes: GitStatusEntry[];
  commits: GitCommit[];
}

/**
 * The supervisor's own tools on a team folder: git, a command terminal,
 * the live preview and deploys. Anything that changes the folder is refused
 * while agents are working in it.
 */
export class CollabWorkspaceService {
  private readonly teams: CollabService;

  constructor(db: ChikaimaDatabase) {
    this.teams = new CollabService(db);
  }

  private open(userId: string, teamId: string) {
    const { team } = this.teams.getTeam(userId, teamId);
    const ws = Workspace.open(team.folder);
    return { team, ws, repo: new GitRepo(ws.root) };
  }

  private assertIdle(folder: string): void {
    if (this.teams.isFolderBusy(folder)) throw conflict("Agents are working in this folder; wait for the run to finish or stop it first.");
  }

  private executor(teamId: string, root: string): Executor {
    const executor = getExecutor(teamId, root);
    if (!executor) throw badRequest("Command execution is off on this server. Set CHIKAIMA_COLLAB_EXEC to docker (recommended) or host.");
    return executor;
  }

  // --- git ---------------------------------------------------------------------

  async gitOverview(userId: string, teamId: string): Promise<GitOverview> {
    const { repo } = this.open(userId, teamId);
    if (!repo.isRepo()) return { is_repo: false, branch: null, branches: [], changes: [], commits: [] };
    const [branch, branches, changes, commits] = await Promise.all([repo.currentBranch().catch(() => null), repo.branches(), repo.status(), repo.log(40)]);
    return { is_repo: true, branch, branches, changes, commits };
  }

  async gitCommitFiles(userId: string, teamId: string, hash: string) {
    const { repo } = this.open(userId, teamId);
    if (!repo.isRepo()) throw badRequest("This folder is not a git repository.");
    return repo.commitFiles(hash);
  }

  async gitInit(userId: string, teamId: string): Promise<void> {
    const { team, repo } = this.open(userId, teamId);
    this.assertIdle(team.folder);
    if (!(await repo.ensureRepo())) throw conflict("This folder is already a git repository.");
  }

  async gitCommit(userId: string, teamId: string, message: string): Promise<string> {
    const { team, repo } = this.open(userId, teamId);
    this.assertIdle(team.folder);
    if (!message?.trim()) throw badRequest("A commit message is required.");
    await repo.ensureRepo();
    const hash = await repo.commitAll(message.trim(), "user");
    if (!hash) throw badRequest("There is nothing to commit.");
    return hash;
  }

  async gitCheckout(userId: string, teamId: string, branch: string): Promise<void> {
    const { team, repo } = this.open(userId, teamId);
    this.assertIdle(team.folder);
    if (!(await repo.branches()).includes(branch)) throw badRequest(`Unknown branch: ${branch}`);
    if (await repo.isDirty()) throw conflict("Commit or discard your changes before switching branches.");
    await repo.checkout(branch);
  }

  /** Merges a branch (typically a run branch the supervisor didn't merge at the time) into the current branch. */
  async gitMerge(userId: string, teamId: string, branch: string): Promise<void> {
    const { team, repo } = this.open(userId, teamId);
    this.assertIdle(team.folder);
    if (!(await repo.branches()).includes(branch)) throw badRequest(`Unknown branch: ${branch}`);
    if (await repo.isDirty()) throw conflict("Commit or discard your changes before merging.");
    if (!(await repo.merge(branch, `Merge ${branch}`))) throw conflict(`Merging ${branch} conflicts with the current branch; resolve it in your editor or terminal.`);
  }

  async gitDiscard(userId: string, teamId: string): Promise<void> {
    const { team, repo } = this.open(userId, teamId);
    this.assertIdle(team.folder);
    if (!repo.isRepo()) throw badRequest("This folder is not a git repository.");
    await repo.discardChanges();
  }

  // --- terminal and deploy ------------------------------------------------------

  /** Runs one command in the team folder (in the project container under Docker), streaming its output. */
  async runTerminal(userId: string, teamId: string, command: string, handlers: StreamHandlers): Promise<CommandResult> {
    const { team, ws } = this.open(userId, teamId);
    if (!command?.trim()) throw badRequest("Enter a command.");
    this.assertIdle(team.folder);
    return this.executor(team.id, ws.root).run(command, ws.root, { timeoutMs: TERMINAL_TIMEOUT_MS, onOutput: handlers.onOutput, signal: handlers.signal });
  }

  /** Runs the team's deploy command. The supervisor pressing Deploy is the approval. */
  async deploy(userId: string, teamId: string, handlers: StreamHandlers): Promise<CommandResult> {
    const { team, ws } = this.open(userId, teamId);
    if (!team.deployCommand) throw badRequest("Set a deploy command in the team settings first.");
    this.assertIdle(team.folder);
    handlers.onOutput(`$ ${team.deployCommand}\n`);
    return this.executor(team.id, ws.root).run(team.deployCommand, ws.root, { timeoutMs: DEPLOY_TIMEOUT_MS, onOutput: handlers.onOutput, signal: handlers.signal });
  }

  // --- preview -----------------------------------------------------------------

  previewInfo(userId: string, teamId: string): PreviewInfo & { configured: boolean } {
    const { team } = this.open(userId, teamId);
    return { ...getPreviewManager().get(team.id), configured: Boolean(team.previewCommand) };
  }

  async startPreview(userId: string, teamId: string): Promise<PreviewInfo> {
    const { team, ws } = this.open(userId, teamId);
    if (!team.previewCommand) throw badRequest("Set a preview command in the team settings first (it gets the port in $PORT).");
    return getPreviewManager().start(team.id, this.executor(team.id, ws.root), ws.root, team.previewCommand);
  }

  async stopPreview(userId: string, teamId: string): Promise<void> {
    const { team } = this.open(userId, teamId);
    await getPreviewManager().stop(team.id);
  }
}
