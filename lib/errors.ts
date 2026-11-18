export class HttpError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details: string[] = []): HttpError {
  return new HttpError(400, message, details);
}

export function unauthorized(message = "Sign in to continue."): HttpError {
  return new HttpError(401, message);
}

export function forbidden(message = "You do not have access to this resource."): HttpError {
  return new HttpError(403, message);
}

export function notFound(message = "Not found."): HttpError {
  return new HttpError(404, message);
}

export function tooManyRequests(message = "Too many requests. Try again shortly."): HttpError {
  return new HttpError(429, message);
}
