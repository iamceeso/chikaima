export function buildBasicAuthHeader(email: string, password: string): string {
  const credentials = `${email.trim()}:${password}`;
  const encoded =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(credentials)
      : Buffer.from(credentials, "utf-8").toString("base64");
  return `Basic ${encoded}`;
}
