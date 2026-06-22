import { NextRequest } from "next/server";

const DEFAULT_INTERNAL_API_ORIGIN = "http://localhost:8000";

function buildBackendUrl(path: string[], search: string): string {
  const origin = (process.env.INTERNAL_API_ORIGIN || DEFAULT_INTERNAL_API_ORIGIN).replace(/\/$/, "");
  const pathname = path.map((segment) => encodeURIComponent(segment)).join("/");
  return `${origin}/api/v1/${pathname}${search}`;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const url = new URL(request.url);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");

  const response = await fetch(buildBackendUrl(path, url.search), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    duplex: "half",
    cache: "no-store",
  } as RequestInit);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
