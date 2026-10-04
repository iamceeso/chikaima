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

function sanitizedEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!SECRET_ENV.test(key)) env[key] = value;
  }
  env.CI = "1";
  return env as NodeJS.ProcessEnv;
}

/** Keeps the head and tail of long output, where errors and summaries usually are. */
function clip(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const half = MAX_OUTPUT_CHARS / 2;
  return `${output.slice(0, half)}\n… (${output.length - MAX_OUTPUT_CHARS} characters omitted) …\n${output.slice(-half)}`;
}

/**
 * Runs a shell command in the team folder with a timeout, combined
 * stdout/stderr, and credentials stripped from the environment. This is
 * not a sandbox: the command runs as the server user, which is why
 * command execution is off unless CHIKAIMA_COLLAB_ALLOW_COMMANDS is set.
 */
export function runCommand(cwd: string, command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CommandResult> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, { cwd, shell: true, env: sanitizedEnv(), detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const append = (chunk: Buffer) => {
      // Bound memory while the command runs; clip() trims the final result.
      if (output.length < MAX_OUTPUT_CHARS * 8) output += chunk.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        // Kill the whole process group so test runners' children die too.
        if (child.pid && process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // already exited
      }
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, output: clip(`${output}${error.message}`), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code, output: clip(output.trim() || "(no output)"), timedOut });
    });
  });
}
