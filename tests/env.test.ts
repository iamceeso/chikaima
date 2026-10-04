import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const execFileAsync = promisify(execFile);

function buildEnv(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...overrides,
  };
}

test.afterEach(() => {
  if (originalApiBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
  }
});

test("env trims NEXT_PUBLIC_API_BASE_URL", async () => {
  process.env.NEXT_PUBLIC_API_BASE_URL = "  https://api.example.com  ";

  const { env } = await import(`../lib/env.js?case=${Math.random()}`);

  assert.equal(env.apiBaseUrl, "https://api.example.com");
});

async function apiBaseUrlInChildProcess(value: string | undefined): Promise<string> {
  const script = 'import("./.test-dist/lib/env.js").then(({ env }) => console.log(env.apiBaseUrl));';
  const { stdout } = await execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: process.cwd(),
    env: buildEnv({ NEXT_PUBLIC_API_BASE_URL: value }),
  });
  return stdout.trim();
}

test("env defaults NEXT_PUBLIC_API_BASE_URL to the same-origin API when missing", async () => {
  assert.equal(await apiBaseUrlInChildProcess(undefined), "/api/v1");
});

test("env defaults NEXT_PUBLIC_API_BASE_URL to the same-origin API when blank after trimming", async () => {
  assert.equal(await apiBaseUrlInChildProcess("   "), "/api/v1");
});
