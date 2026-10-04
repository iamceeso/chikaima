import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];

function detectChrome(): string {
  return CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ?? "";
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

const PLACEHOLDER_JWT_SECRET = "change-me-development-secret";
const PLACEHOLDER_JWT_REFRESH_SECRET = "change-me-too-development-secret";
const PLACEHOLDER_PROVIDER_SECRET = "replace-with-32-char-secret-key";

export interface ChikaimaConfig {
  appName: string;
  appEnv: string;
  isProduction: boolean;
  dbPath: string;
  jwtSecretKey: string;
  jwtRefreshSecretKey: string;
  accessTokenExpireMinutes: number;
  refreshTokenExpireDays: number;
  providerSecretKey: string;
  mediaRoot: string;
  documentUploadMaxBytes: number;
  audioUploadMaxBytes: number;
  videoUploadMaxBytes: number;
  embeddingDimension: number;
  ragTopK: number;
  ollamaBaseUrl: string;
  /** Optional JSON file of extra/overriding provider models; see core/providers/userCatalog.ts. */
  providerCatalogPath: string;
  /** "economy" routes background summarization to a cheaper model on the default provider when one exists; "default" always uses the default model. */
  backgroundModelRouting: "economy" | "default";
  /** Directory that every collaboration team folder must live inside; models can never read or write outside it. */
  collabRoot: string;
  /**
   * Where agent and terminal commands run: "off" (default; no commands at all),
   * "host" (as the Chikaima process user, not confined to the folder), or
   * "docker" (one resource-limited container per project, with only its
   * folder mounted).
   */
  collabExec: "off" | "host" | "docker";
  /** Image for project containers when collabExec is "docker". */
  collabDockerImage: string;
  collabDockerMemory: string;
  collabDockerCpus: string;
  /**
   * The collaboration root as the Docker daemon sees it. Only differs from
   * collabRoot when Chikaima itself runs in a container and talks to the
   * host's Docker socket, since bind mounts use host paths.
   */
  collabHostRoot: string;
  /** Host ports handed out to project previews, inclusive. */
  collabPreviewPortStart: number;
  collabPreviewPortEnd: number;
  /** Hostname the server uses to reach previews (for agents' browse/screenshot tools). */
  collabPreviewHost: string;
  /** Chrome/Chromium binary for preview screenshots; empty disables screenshots. */
  chromePath: string;
}

function build(): ChikaimaConfig {
  const appEnv = (process.env.CHIKAIMA_APP_ENV ?? "development").trim() || "development";
  const isProduction = appEnv.toLowerCase() === "production";

  const jwtSecretKey = process.env.CHIKAIMA_JWT_SECRET_KEY?.trim() || (isProduction ? "" : PLACEHOLDER_JWT_SECRET);
  const jwtRefreshSecretKey = process.env.CHIKAIMA_JWT_REFRESH_SECRET_KEY?.trim() || (isProduction ? "" : PLACEHOLDER_JWT_REFRESH_SECRET);
  const providerSecretKey = process.env.CHIKAIMA_PROVIDER_SECRET_KEY?.trim() || (isProduction ? "" : PLACEHOLDER_PROVIDER_SECRET);

  if (isProduction) {
    const insecure = [
      jwtSecretKey === PLACEHOLDER_JWT_SECRET && "CHIKAIMA_JWT_SECRET_KEY",
      jwtRefreshSecretKey === PLACEHOLDER_JWT_REFRESH_SECRET && "CHIKAIMA_JWT_REFRESH_SECRET_KEY",
      providerSecretKey === PLACEHOLDER_PROVIDER_SECRET && "CHIKAIMA_PROVIDER_SECRET_KEY",
      !jwtSecretKey && "CHIKAIMA_JWT_SECRET_KEY",
      !jwtRefreshSecretKey && "CHIKAIMA_JWT_REFRESH_SECRET_KEY",
      !providerSecretKey && "CHIKAIMA_PROVIDER_SECRET_KEY",
    ].filter((value): value is string => Boolean(value));
    if (insecure.length > 0) {
      throw new Error(`Production settings require real secret values for: ${Array.from(new Set(insecure)).sort().join(", ")}`);
    }
  }

  if (jwtSecretKey.length < 16 || jwtRefreshSecretKey.length < 16 || providerSecretKey.length < 16) {
    throw new Error("JWT and provider secret keys must be at least 16 characters.");
  }

  const dbPath = process.env.CHIKAIMA_DB_PATH?.trim() || "./data/chikaima.db";
  const backgroundModelRouting = (process.env.CHIKAIMA_BACKGROUND_MODEL_ROUTING?.trim() || "economy").toLowerCase();
  if (backgroundModelRouting !== "economy" && backgroundModelRouting !== "default") {
    throw new Error(`CHIKAIMA_BACKGROUND_MODEL_ROUTING must be "economy" or "default", got: ${backgroundModelRouting}`);
  }

  const collabExec = (process.env.CHIKAIMA_COLLAB_EXEC?.trim() || "off").toLowerCase();
  if (collabExec !== "off" && collabExec !== "host" && collabExec !== "docker") {
    throw new Error(`CHIKAIMA_COLLAB_EXEC must be "off", "host" or "docker", got: ${collabExec}`);
  }

  return {
    appName: process.env.CHIKAIMA_APP_NAME ?? "Chikaima",
    appEnv,
    isProduction,
    dbPath,
    jwtSecretKey,
    jwtRefreshSecretKey,
    accessTokenExpireMinutes: intEnv("CHIKAIMA_ACCESS_TOKEN_EXPIRE_MINUTES", 30),
    refreshTokenExpireDays: intEnv("CHIKAIMA_REFRESH_TOKEN_EXPIRE_DAYS", 7),
    providerSecretKey,
    mediaRoot: process.env.CHIKAIMA_MEDIA_ROOT?.trim() || "./storage",
    documentUploadMaxBytes: intEnv("CHIKAIMA_DOCUMENT_UPLOAD_MAX_MEGABYTES", 100) * 1024 * 1024,
    audioUploadMaxBytes: intEnv("CHIKAIMA_AUDIO_UPLOAD_MAX_MEGABYTES", 512) * 1024 * 1024,
    videoUploadMaxBytes: intEnv("CHIKAIMA_VIDEO_UPLOAD_MAX_MEGABYTES", 2048) * 1024 * 1024,
    embeddingDimension: intEnv("CHIKAIMA_EMBEDDING_DIMENSION", 384),
    ragTopK: intEnv("CHIKAIMA_RAG_TOP_K", 3),
    ollamaBaseUrl: process.env.CHIKAIMA_OLLAMA_BASE_URL?.trim() || "http://localhost:11434",
    providerCatalogPath:
      process.env.CHIKAIMA_PROVIDER_CATALOG_PATH?.trim() || (dbPath === ":memory:" ? "./data/providers.json" : join(dirname(dbPath), "providers.json")),
    backgroundModelRouting,
    collabRoot: process.env.CHIKAIMA_COLLAB_ROOT?.trim() || "./data/workspaces",
    collabExec,
    collabDockerImage: process.env.CHIKAIMA_COLLAB_DOCKER_IMAGE?.trim() || "node:22-bookworm",
    collabDockerMemory: process.env.CHIKAIMA_COLLAB_DOCKER_MEMORY?.trim() || "2g",
    collabDockerCpus: process.env.CHIKAIMA_COLLAB_DOCKER_CPUS?.trim() || "2",
    collabHostRoot: process.env.CHIKAIMA_COLLAB_HOST_ROOT?.trim() || "",
    collabPreviewPortStart: intEnv("CHIKAIMA_COLLAB_PREVIEW_PORT_START", 4100),
    collabPreviewPortEnd: intEnv("CHIKAIMA_COLLAB_PREVIEW_PORT_END", 4199),
    collabPreviewHost: process.env.CHIKAIMA_COLLAB_PREVIEW_HOST?.trim() || "127.0.0.1",
    chromePath: process.env.CHIKAIMA_CHROME_PATH?.trim() ?? detectChrome(),
  };
}

let cached: ChikaimaConfig | null = null;

export function getConfig(): ChikaimaConfig {
  if (!cached) {
    cached = build();
  }
  return cached;
}

export function __resetConfigForTests(): void {
  cached = null;
}

export { requireEnv };
