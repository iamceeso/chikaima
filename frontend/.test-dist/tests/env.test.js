"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const node_test_1 = __importDefault(require("node:test"));
const originalApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function buildEnv(overrides) {
    return {
        ...process.env,
        ...overrides,
    };
}
node_test_1.default.afterEach(() => {
    if (originalApiBaseUrl === undefined) {
        delete process.env.NEXT_PUBLIC_API_BASE_URL;
    }
    else {
        process.env.NEXT_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }
});
(0, node_test_1.default)("env trims NEXT_PUBLIC_API_BASE_URL", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "  https://api.example.com  ";
    const { env } = await import(`../lib/env.js?case=${Math.random()}`);
    strict_1.default.equal(env.apiBaseUrl, "https://api.example.com");
});
(0, node_test_1.default)("env throws when NEXT_PUBLIC_API_BASE_URL is missing", async () => {
    const script = 'import("./.test-dist/lib/env.js").catch((error) => { console.error(error.message); process.exit(1); });';
    await strict_1.default.rejects(() => execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: buildEnv({ NEXT_PUBLIC_API_BASE_URL: undefined }),
    }), (error) => typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        typeof error.stderr === "string" &&
        error.stderr.includes("Missing required environment variable: NEXT_PUBLIC_API_BASE_URL"));
});
(0, node_test_1.default)("env throws when NEXT_PUBLIC_API_BASE_URL is blank after trimming", async () => {
    const script = 'import("./.test-dist/lib/env.js").catch((error) => { console.error(error.message); process.exit(1); });';
    await strict_1.default.rejects(() => execFileAsync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        env: buildEnv({
            NEXT_PUBLIC_API_BASE_URL: "   ",
        }),
    }), (error) => typeof error === "object" &&
        error !== null &&
        "stderr" in error &&
        typeof error.stderr === "string" &&
        error.stderr.includes("Missing required environment variable: NEXT_PUBLIC_API_BASE_URL"));
});
