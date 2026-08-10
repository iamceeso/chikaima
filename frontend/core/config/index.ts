function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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

  return {
    appName: process.env.CHIKAIMA_APP_NAME ?? "Chikaima",
    appEnv,
    isProduction,
    dbPath: process.env.CHIKAIMA_DB_PATH?.trim() || "./data/chikaima.db",
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
