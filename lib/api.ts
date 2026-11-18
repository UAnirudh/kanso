import { z } from "zod";
import { HttpError } from "./errors";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/**
 * Every API route funnels failures through here so clients always receive a
 * consistent, safe error envelope and internal details never leak.
 */
export async function withApi(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.message, details: error.details }, error.status);
    }
    if (error instanceof z.ZodError) {
      return json(
        {
          error: "Some fields need attention.",
          details: error.issues.map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`),
        },
        400,
      );
    }
    console.error("[api] unhandled error", error);
    return json({ error: "Something went wrong on our side." }, 500);
  }
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Expected a JSON body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "Some fields need attention.",
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`),
    );
  }
  return parsed.data;
}
