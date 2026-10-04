import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getConfig } from "../config/index.js";
import { badRequest, serviceUnavailable } from "../errors.js";
import type { Executor } from "./sandbox.js";

const MAX_LOG_CHARS = 64_000;
const MAX_PAGE_CHARS = 20_000;

export type PreviewStatus = "stopped" | "starting" | "running" | "exited";

export interface PreviewInfo {
  status: PreviewStatus;
  command: string | null;
  /** Host port the browser loads the preview from. */
  port: number | null;
  exitCode: number | null;
  startedAt: string | null;
  logs: string;
}

interface PreviewProcess {
  info: PreviewInfo;
  abort: AbortController;
}

/**
 * One dev server per team, started from the team's preview command with
 * $PORT set. Runs through the team's executor, so in Docker mode it lives
 * in the project container with its port published to the host.
 */
class PreviewManager {
  private readonly previews = new Map<string, PreviewProcess>();

  get(teamId: string): PreviewInfo {
    return this.previews.get(teamId)?.info ?? { status: "stopped", command: null, port: null, exitCode: null, startedAt: null, logs: "" };
  }

  async start(teamId: string, executor: Executor, folderRoot: string, command: string): Promise<PreviewInfo> {
    await this.stop(teamId);
    const { bind, host } = await executor.previewPorts();
    const abort = new AbortController();
    const info: PreviewInfo = { status: "starting", command, port: host, exitCode: null, startedAt: new Date().toISOString(), logs: "" };
    this.previews.set(teamId, { info, abort });

    void executor
      .run(command, folderRoot, {
        timeoutMs: 0,
        env: { PORT: String(bind), HOST: "0.0.0.0", BROWSER: "none" },
        signal: abort.signal,
        onOutput: (chunk) => {
          info.logs = (info.logs + chunk).slice(-MAX_LOG_CHARS);
          if (info.status === "starting") info.status = "running";
        },
      })
      .then((result) => {
        if (this.previews.get(teamId)?.info !== info) return;
        info.status = "exited";
        info.exitCode = result.exitCode;
      });

    // Report "running" once the port answers, even if the server prints nothing.
    void waitForPort(host, 60_000, abort.signal).then((up) => {
      if (up && info.status === "starting") info.status = "running";
    });
    return info;
  }

  async stop(teamId: string): Promise<void> {
    const current = this.previews.get(teamId);
    if (!current) return;
    current.abort.abort();
    current.info.status = "stopped";
    this.previews.delete(teamId);
  }
}

async function waitForPort(port: number, timeoutMs: number, signal: AbortSignal): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !signal.aborted) {
    try {
      await fetch(previewUrl(port, "/"), { signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  return false;
}

export function getPreviewManager(): PreviewManager {
  const globalKey = "__chikaimaPreviewManager__";
  const globalRef = globalThis as typeof globalThis & { [globalKey]?: PreviewManager };
  globalRef[globalKey] ??= new PreviewManager();
  return globalRef[globalKey]!;
}

/** URL the server (not the browser) uses to reach a preview. */
export function previewUrl(port: number, path: string): string {
  const cleaned = `/${String(path || "/").replace(/^\/+/, "")}`;
  if (/^\/\//.test(cleaned) || /[\s\\]/.test(cleaned)) throw badRequest("Preview path must be a plain path like /pricing.");
  return `http://${getConfig().collabPreviewHost}:${port}${cleaned}`;
}

/** The preview page as text, for agents without vision: status, title, and visible text with markup stripped. */
export async function browsePreview(port: number, path: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(previewUrl(port, path), { signal: AbortSignal.timeout(15_000), redirect: "follow" });
  } catch (error) {
    return `Could not load the preview: ${error instanceof Error ? error.message : String(error)}`;
  }
  const html = await response.text();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const text = html
    .replace(/<head[\s>][\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return `HTTP ${response.status}${title ? ` · ${title}` : ""}\n${text.slice(0, MAX_PAGE_CHARS)}`;
}

/** A PNG screenshot of the preview via headless Chrome, base64-encoded. */
export async function screenshotPreview(port: number, path: string): Promise<string> {
  const chrome = getConfig().chromePath;
  if (!chrome) throw serviceUnavailable("Screenshots need Chrome or Chromium; set CHIKAIMA_CHROME_PATH.");
  const url = previewUrl(port, path);
  const dir = mkdtempSync(join(tmpdir(), "chikaima-shot-"));
  const file = join(dir, "shot.png");
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        chrome,
        ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--window-size=1280,800", "--virtual-time-budget=5000", `--screenshot=${file}`, url],
        { timeout: 45_000 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return readFileSync(file).toString("base64");
  } catch (error) {
    throw serviceUnavailable(`Screenshot failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
