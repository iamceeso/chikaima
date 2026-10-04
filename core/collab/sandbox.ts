import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { getConfig } from "../config/index.js";
import { badRequest, serviceUnavailable } from "../errors.js";
import { runCommand, spawnCollected, type CommandResult, type RunOptions } from "./commands.js";

/** The port a project's preview server listens on inside its container. */
export const CONTAINER_PREVIEW_PORT = 3000;

/** Where a team's git worktrees live: inside the collaboration root, but outside every team folder. */
export function worktreeDir(teamId: string): string {
  const dir = resolve(getConfig().collabRoot, ".chikaima", "worktrees", teamId);
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

export interface Executor {
  readonly kind: "host" | "docker";
  /** Runs a shell command with `cwd` (an absolute path in the team folder or one of its worktrees). */
  run(command: string, cwd: string, options?: RunOptions): Promise<CommandResult>;
  /** Port the preview server should bind to, and the host port the browser and agents reach it on. */
  previewPorts(): Promise<{ bind: number; host: number }>;
  /** Stops and removes anything the executor created (the project container). */
  dispose(): Promise<void>;
}

/** Commands run directly on this machine as the server user. Opt-in only: nothing confines them to the folder. */
export class HostExecutor implements Executor {
  readonly kind = "host" as const;
  private port: number | null = null;

  constructor(private readonly teamId: string) {}

  run(command: string, cwd: string, options: RunOptions = {}): Promise<CommandResult> {
    return runCommand(cwd, command, options);
  }

  async previewPorts(): Promise<{ bind: number; host: number }> {
    this.port ??= await allocatePort(this.teamId);
    return { bind: this.port, host: this.port };
  }

  async dispose(): Promise<void> {
    releasePort(this.teamId);
  }
}

function docker(args: string[], options: RunOptions = {}): Promise<CommandResult> {
  return spawnCollected("docker", args, process.cwd(), { timeoutMs: 120_000, ...options, processEnv: process.env });
}

/**
 * One long-lived container per project: only the team folder (at
 * /workspace) and its worktrees (at /worktrees) are mounted, memory, CPU
 * and process count are capped, and privilege escalation is disabled.
 * Commands run via `docker exec`, so dependencies installed by one command
 * are there for the next, and the preview port is published to the host.
 */
export class DockerExecutor implements Executor {
  readonly kind = "docker" as const;
  readonly container: string;
  private ready: Promise<void> | null = null;
  private hostPort: number | null = null;

  constructor(
    private readonly teamId: string,
    private readonly folderRoot: string,
  ) {
    this.container = `chikaima-ws-${teamId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  }

  /** Maps a local path under the collaboration root to the path the Docker daemon sees. */
  private hostPath(localPath: string): string {
    const config = getConfig();
    const localRoot = realpathSync(resolve(config.collabRoot));
    if (!config.collabHostRoot) return localPath;
    return resolve(config.collabHostRoot, relative(localRoot, localPath));
  }

  /** Maps a local folder/worktree path to the matching path inside the container. */
  containerPath(localPath: string): string {
    const worktrees = worktreeDir(this.teamId);
    if (localPath === this.folderRoot || localPath.startsWith(this.folderRoot + sep)) {
      return `/workspace/${relative(this.folderRoot, localPath).split(sep).join("/")}`.replace(/\/$/, "");
    }
    if (localPath === worktrees || localPath.startsWith(worktrees + sep)) {
      return `/worktrees/${relative(worktrees, localPath).split(sep).join("/")}`.replace(/\/$/, "");
    }
    throw badRequest("Commands can only run inside the team folder.");
  }

  private ensure(): Promise<void> {
    this.ready ??= this.start().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async start(): Promise<void> {
    const config = getConfig();
    const inspect = await docker(["inspect", "-f", "{{.State.Running}}", this.container], { timeoutMs: 20_000 });
    if (inspect.exitCode === 0) {
      if (!inspect.output.trim().startsWith("true")) {
        const started = await docker(["start", this.container]);
        if (started.exitCode !== 0) throw serviceUnavailable(`Could not start the project container: ${started.output}`);
      }
      const port = await docker(["port", this.container, `${CONTAINER_PREVIEW_PORT}/tcp`], { timeoutMs: 20_000 });
      const match = /:(\d+)\s*$/m.exec(port.output);
      if (match) this.hostPort = Number(match[1]);
      return;
    }
    if (/Cannot connect|not found|executable file not found|ENOENT/i.test(inspect.output) && !/No such object/i.test(inspect.output)) {
      throw serviceUnavailable(`Docker is not available: ${inspect.output.split("\n")[0]}`);
    }

    // The port is only checked from this process; on the Docker host it may already be taken, so try a few.
    let created: CommandResult | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      this.hostPort = await allocatePort(this.teamId);
      created = await this.create(config);
      if (created.exitCode === 0 || !/port is already allocated|address already in use/i.test(created.output)) break;
      await docker(["rm", "-f", this.container], { timeoutMs: 30_000 });
      markPortTaken(this.teamId);
    }
    if (created?.exitCode !== 0) throw serviceUnavailable(`Could not create the project container: ${created?.output ?? "unknown error"}`);
  }

  private create(config: ReturnType<typeof getConfig>): Promise<CommandResult> {
    return docker(
      [
        "run",
        "-d",
        "--name",
        this.container,
        "--label",
        `chikaima.team=${this.teamId}`,
        "--memory",
        config.collabDockerMemory,
        "--cpus",
        config.collabDockerCpus,
        "--pids-limit",
        "1024",
        "--security-opt",
        "no-new-privileges",
        // Run as Chikaima's own user so files agents create in the mounted folder aren't root-owned on Linux hosts.
        ...(typeof process.getuid === "function" && process.getuid() !== 0 ? ["--user", `${process.getuid()}:${process.getgid?.() ?? process.getuid()}`, "-e", "HOME=/tmp"] : []),
        "-v",
        `${this.hostPath(this.folderRoot)}:/workspace`,
        "-v",
        `${this.hostPath(worktreeDir(this.teamId))}:/worktrees`,
        "-w",
        "/workspace",
        "-p",
        `${this.hostPort}:${CONTAINER_PREVIEW_PORT}`,
        config.collabDockerImage,
        "sleep",
        "infinity",
      ],
      { timeoutMs: 600_000 },
    );
  }

  async run(command: string, cwd: string, options: RunOptions = {}): Promise<CommandResult> {
    await this.ensure();
    const marker = `chikaima-${randomUUID()}`;
    const env = Object.entries({ CI: "1", ...options.env }).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
    const seconds = options.timeoutMs === 0 ? 0 : Math.ceil((options.timeoutMs ?? 180_000) / 1000);
    // `timeout` enforces the limit inside the container (killing the docker CLI alone would orphan the process);
    // the marker lets an abort find and kill the in-container process tree.
    const inner = seconds > 0 ? ["timeout", "-s", "KILL", String(seconds), "sh", "-c", `${command}\n# ${marker}`] : ["sh", "-c", `${command}\n# ${marker}`];
    const abort = () => void docker(["exec", this.container, "pkill", "-KILL", "-f", marker], { timeoutMs: 15_000 });
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const result = await docker(["exec", "-w", this.containerPath(cwd), ...env, this.container, ...inner], { ...options, timeoutMs: 0, env: undefined });
      // GNU timeout exits 137 when it had to SIGKILL the command.
      return seconds > 0 && result.exitCode === 137 ? { ...result, timedOut: true } : result;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
  }

  async previewPorts(): Promise<{ bind: number; host: number }> {
    await this.ensure();
    if (!this.hostPort) throw serviceUnavailable("The project container has no published preview port; remove it and try again.");
    return { bind: CONTAINER_PREVIEW_PORT, host: this.hostPort };
  }

  async dispose(): Promise<void> {
    await docker(["rm", "-f", this.container], { timeoutMs: 60_000 });
    this.ready = null;
    releasePort(this.teamId);
  }
}

// --- preview port allocation ----------------------------------------------------

const portsKey = "__chikaimaPreviewPorts__";
function allocatedPorts(): Map<string, number> {
  const globalRef = globalThis as typeof globalThis & { [portsKey]?: Map<string, number> };
  globalRef[portsKey] ??= new Map();
  return globalRef[portsKey]!;
}

async function portIsFree(port: number): Promise<boolean> {
  const { createServer } = await import("node:net");
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once("error", () => resolvePort(false));
    server.listen(port, "0.0.0.0", () => server.close(() => resolvePort(true)));
  });
}

async function allocatePort(teamId: string): Promise<number> {
  const ports = allocatedPorts();
  const existing = ports.get(teamId);
  if (existing) return existing;
  const { collabPreviewPortStart: start, collabPreviewPortEnd: end } = getConfig();
  const taken = new Set(ports.values());
  for (let port = start; port <= end; port++) {
    if (!taken.has(port) && (await portIsFree(port))) {
      ports.set(teamId, port);
      return port;
    }
  }
  throw serviceUnavailable(`No free preview port between ${start} and ${end}.`);
}

function releasePort(teamId: string): void {
  allocatedPorts().delete(teamId);
}

/** Records the team's current port as unusable (taken on the Docker host) so the next allocation skips it. */
function markPortTaken(teamId: string): void {
  const ports = allocatedPorts();
  const port = ports.get(teamId);
  ports.delete(teamId);
  if (port !== undefined) ports.set(`taken:${port}`, port);
}

// --- executor registry ----------------------------------------------------------

const executorsKey = "__chikaimaExecutors__";

/** The team's executor, or null when command execution is off. One per team per process, so a team's container is reused. */
export function getExecutor(teamId: string, folderRoot: string): Executor | null {
  const mode = getConfig().collabExec;
  if (mode === "off") return null;
  const globalRef = globalThis as typeof globalThis & { [executorsKey]?: Map<string, Executor> };
  globalRef[executorsKey] ??= new Map();
  const executors = globalRef[executorsKey]!;
  let executor = executors.get(teamId);
  if (!executor || executor.kind !== mode) {
    executor = mode === "docker" ? new DockerExecutor(teamId, folderRoot) : new HostExecutor(teamId);
    executors.set(teamId, executor);
  }
  return executor;
}

/** Removes a team's executor (and its container), e.g. when the team is deleted. */
export async function disposeExecutor(teamId: string): Promise<void> {
  const globalRef = globalThis as typeof globalThis & { [executorsKey]?: Map<string, Executor> };
  const executor = globalRef[executorsKey]?.get(teamId);
  globalRef[executorsKey]?.delete(teamId);
  await executor?.dispose();
}
