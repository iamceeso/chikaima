// The API is served by this same Next.js app, so a same-origin path works
// without any configuration; set NEXT_PUBLIC_API_BASE_URL only to point the
// UI at a different host.
const DEFAULT_API_BASE_URL = "/api/v1";

function envOrDefault(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export const env = {
  appName: "Chikaima",
  apiBaseUrl: envOrDefault(process.env.NEXT_PUBLIC_API_BASE_URL, DEFAULT_API_BASE_URL),
};
