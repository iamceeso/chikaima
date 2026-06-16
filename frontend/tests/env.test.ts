import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const execFileAsync = promisify(execFile);

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

test("env throws when NEXT_PUBLIC_API_BASE_URL is missing", async () => {
  const script = 'import("./.test-dist/lib/env.js").catch((error) => { console.error(error.message); process.exit(1); });';

  await assert.rejects(
    () =>
      execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: {},
      }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string" &&
      (error as { stderr: string }).stderr.includes("Missing required environment variable: NEXT_PUBLIC_API_BASE_URL"),
  );
});

test("env throws when NEXT_PUBLIC_API_BASE_URL is blank after trimming", async () => {
  const script = 'import("./.test-dist/lib/env.js").catch((error) => { console.error(error.message); process.exit(1); });';

  await assert.rejects(
    () =>
      execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: {
          NEXT_PUBLIC_API_BASE_URL: "   ",
        },
      }),
    (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr?: unknown }).stderr === "string" &&
      (error as { stderr: string }).stderr.includes("Missing required environment variable: NEXT_PUBLIC_API_BASE_URL"),
  );
});
