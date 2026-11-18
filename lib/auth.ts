import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, newId, nowIso } from "./db";
import { HttpError, unauthorized } from "./errors";

const SESSION_COOKIE = "kanso_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export async function startSession(userId: string): Promise<void> {
  const db = getDb();
  const id = newId("sess");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(id, userId, expiresAt, nowIso());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.id AS id, u.email AS email, u.name AS name, s.expires_at AS expires_at
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId) as
    | { id: string; email: string; name: string; expires_at: string }
    | undefined;

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** API-route variant: throws a 401 instead of redirecting. */
export async function requireApiUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return; // same-origin fetches from server-side tools omit it
  const host = request.headers.get("host");
  try {
    const originUrl = new URL(origin);
    if (host && originUrl.host !== host) {
      throw new HttpError(403, "Cross-origin request blocked.");
    }
  } catch {
    throw new HttpError(403, "Invalid origin.");
  }
}
