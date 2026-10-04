import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 180_000;
const MAX_OUTPUT_CHARS = 16_000;
/** Environment variables that look like credentials are never passed to agent commands. */
const SECRET_ENV = /SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE|CREDENTIAL|^CHIKAIMA_/i;

export interface CommandResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
}

export interface RunOptions {
  /** 0 disables the timeout (long-running processes such as a preview server). */
  timeoutMs?: number;
  env?: Record<string, string>;
  /** Receives output as it arrives (terminal and preview logs). */
  onOutput?: (chunk: string) => void;
  /** Aborting kills the process. */
  signal?: AbortSignal;
}

export function sanitizedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!SECRET_ENV.test(key)) env[key] = value;
  }
  env.CI = "1";
  return { ...env, ...extra } as NodeJS.ProcessEnv;
}

/** Keeps the head and tail of long output, where errors and summaries usually are. */
export function clip(output: string, max = MAX_OUTPUT_CHARS): string {
  if (output.length <= max) return output;
  const half = max / 2;
  return `${output.slice(0, half)}\n… (${output.length - max} characters omitted) …\n${output.slice(-half)}`;
}

/**
 * Spawns a program (no shell unless `program` is one) with a timeout,
 * combined stdout/stderr, streaming output and abort. The whole process
 * group is killed on timeout or abort so test runners' children die too.
 */
export function spawnCollected(
  program: string,
  args: string[],
  cwd: string,
  options: RunOptions & { processEnv?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(program, args, {
      cwd,
      env: options.processEnv ?? sanitizedEnv(options.env),
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const kill = () => {
      try {
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // already exited
      }
    };
    const append = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      options.onOutput?.(text);
      // Bound memory while the command runs; clip() trims the final result.
      if (output.length < MAX_OUTPUT_CHARS * 8) output += text;
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = timeoutMs > 0 ? setTimeout(() => ((timedOut = true), kill()), timeoutMs) : null;
    const onAbort = () => kill();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) kill();

    const finish = (result: CommandResult) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    child.on("error", (error) => finish({ exitCode: null, output: clip(`${output}${error.message}`), timedOut }));
    child.on("close", (code) => finish({ exitCode: code, output: clip(output.trim() || "(no output)"), timedOut }));
  });
}

/**
 * Runs a shell command in a folder on this machine, with credentials
 * stripped from the environment. Not a sandbox: it runs as the server user,
 * which is why the host executor is opt-in (CHIKAIMA_COLLAB_EXEC=host).
 */
export function runCommand(cwd: string, command: string, options: RunOptions | number = {}): Promise<CommandResult> {
  const resolved = typeof options === "number" ? { timeoutMs: options } : options;
  return spawnCollected("sh", ["-c", command], cwd, resolved);
}
