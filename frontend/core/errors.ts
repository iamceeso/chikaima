/**
 * Framework-independent equivalent of FastAPI's HTTPException. Route
 * Handlers catch this and translate it into a NextResponse with the given
 * status code, keeping HTTP concerns out of Chikaima Core.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly detail: string;

  constructor(statusCode: number, detail: string) {
    super(detail);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export function badRequest(detail: string): HttpError {
  return new HttpError(400, detail);
}

export function unauthorized(detail: string): HttpError {
  return new HttpError(401, detail);
}

export function forbidden(detail: string): HttpError {
  return new HttpError(403, detail);
}

export function notFound(detail: string): HttpError {
  return new HttpError(404, detail);
}

export function conflict(detail: string): HttpError {
  return new HttpError(409, detail);
}

export function payloadTooLarge(detail: string): HttpError {
  return new HttpError(413, detail);
}

export function badGateway(detail: string): HttpError {
  return new HttpError(502, detail);
}

export function serviceUnavailable(detail: string): HttpError {
  return new HttpError(503, detail);
}

export function notImplemented(detail: string): HttpError {
  return new HttpError(501, detail);
}
