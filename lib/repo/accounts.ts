import crypto from "node:crypto";
import { getDb, newId, nowIso, transaction } from "../db";
import { HttpError } from "../errors";
import { consumeRateLimit } from "./rate-limit";
import { joinSharedWorkspace } from "./workspaces";

/**
 * Accounts exist so identity can outlive a browser.
 *
 * A guest row and an account row are the same row: claiming sets the credentials
 * on the guest the browser already has, so its workspace memberships and its
 * personal interface documents do not move. Signing in on another device
 * resolves the same row through a session, which is what makes both the role and
 * the interface follow the person rather than the cookie.
 *
 * Passwords use Node's built-in scrypt, so there is no new dependency and no
 * third-party identity service to configure.
 */

export interface AccountUser {
  id: string;
  name: string;
  email: string | null;
}

export interface SessionTicket {
  token: string;
  userId: string;
  expiresAt: string;
}

export const SESSION_DURATION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

export const SIGN_IN_ATTEMPT_LIMIT = 5;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
export const SIGN_IN_ORIGIN_LIMIT = 20;
export const SIGN_UP_ATTEMPT_LIMIT = 3;
export const SIGN_UP_WINDOW_MS = 60 * 60 * 1000;
export const SIGN_UP_ORIGIN_LIMIT = SIGN_IN_ORIGIN_LIMIT;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const KEY_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Credential attempts are budgeted per email, in their own buckets, so guessing
 * one address cannot lock out everybody else and sign-ups cannot burn a
 * sign-in budget. The address is lowercased first, because the bucket must not
 * depend on how the attempt was typed.
 */
function credentialBucket(kind: "signin" | "signup", rawEmail: string): string {
  return `auth:${kind}:${rawEmail.trim().toLowerCase().slice(0, 254)}`;
}

export function assertSignInAllowed(rawEmail: string, now: number = Date.now()): void {
  if (
    !consumeRateLimit(
      credentialBucket("signin", rawEmail),
      SIGN_IN_ATTEMPT_LIMIT,
      SIGN_IN_WINDOW_MS,
      now,
    )
  ) {
    throw new HttpError(
      429,
      `Too many sign-in attempts. Wait ${SIGN_IN_WINDOW_MS / 60_000} minutes and try again.`,
    );
  }
}

export function assertSignUpAllowed(rawEmail: string, now: number = Date.now()): void {
  if (!consumeRateLimit(
      credentialBucket("signup", rawEmail),
      SIGN_UP_ATTEMPT_LIMIT,
      SIGN_UP_WINDOW_MS,
      now,
    )
  ) {
    throw new HttpError(429, "Too many accounts created from here. Try again later.");
  }
}

/**
 * A second, wider budget for the caller's own address.
 *
 * The per-email budget stops guessing one password. It does nothing against one
 * guess each across a thousand addresses, which is cheap because every attempt
 * is a separate account. This bucket counts all sign-in attempts from one origin
 * in the same window, so a spread-out guess eventually costs something. The limit
 * is deliberately higher than the per-email one: people behind one NAT or office
 * network share an origin, and a handful of typos must not lock a team out.
 *
 * The origin is hashed into the bucket, so the event table never stores an IP.
 */
function originBucket(kind: "signin" | "signup", origin: string): string {
  const fingerprint = crypto
    .createHash("sha256")
    .update(`origin:${origin}`)
    .digest("hex")
    .slice(0, 24);
  return `auth:${kind}:origin:${fingerprint}`;
}

export function assertSignInOriginAllowed(origin: string, now: number = Date.now()): void {
  if (
    !consumeRateLimit(
      originBucket("signin", origin),
      SIGN_IN_ORIGIN_LIMIT,
      SIGN_IN_WINDOW_MS,
      now,
    )
  ) {
    throw new HttpError(
      429,
      `Too many sign-in attempts from this network. Wait ${SIGN_IN_WINDOW_MS / 60_000} minutes and try again.`,
    );
  }
}

/**
 * The same network cap for account creation, in its own bucket so signing up
 * cannot spend a sign-in budget (or the reverse). Twenty attempts per window is
 * generous for a team and far too few for a script creating accounts in bulk.
 */
export function assertSignUpOriginAllowed(origin: string, now: number = Date.now()): void {
  if (
    !consumeRateLimit(
      originBucket("signup", origin),
      SIGN_UP_ORIGIN_LIMIT,
      SIGN_IN_WINDOW_MS,
      now,
    )
  ) {
    throw new HttpError(
      429,
      `Too many accounts created from this network. Wait ${SIGN_IN_WINDOW_MS / 60_000} minutes and try again.`,
    );
  }
}

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return email;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Constant-time check; an unreadable stored hash simply fails. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
    SCRYPT,
  );
  return crypto.timingSafeEqual(expected, actual);
}

// Verified against when no row matches, so a missing account costs the same time
// as a wrong password and cannot be probed by response timing.
const DUMMY_HASH = hashPassword("kanso-dummy-password");

function findById(userId: string): AccountUser | null {
  const row = getDb()
    .prepare("SELECT id, name, email FROM users WHERE id = ? AND is_system = 0")
    .get(userId) as AccountUser | undefined;
  return row ?? null;
}

function assertPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

/**
 * Turns the current viewer's row into an account, or creates one when the visitor
 * has no guest identity yet.
 *
 * `device_id` is cleared on claim: the row now belongs to an account, not to one
 * browser. If the person signs out, that browser mints a fresh guest instead of
 * silently keeping the account through the device cookie.
 */
export function claimAccount(input: {
  userId: string | null;
  email: string;
  password: string;
  name?: string;
}): AccountUser {
  const email = normalizeEmail(input.email);
  assertPassword(input.password);

  return transaction(() => {
    const taken = getDb()
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email) as { id: string } | undefined;
    if (taken && taken.id !== input.userId) {
      throw new HttpError(409, "That email already has an account. Sign in instead.");
    }

    const now = nowIso();
    const passwordHash = hashPassword(input.password);
    const name = input.name?.trim();

    if (input.userId) {
      const existing = findById(input.userId);
      if (!existing) throw new HttpError(404, "That identity no longer exists.");
      getDb()
        .prepare(
          `UPDATE users
              SET email = ?, password_hash = ?, name = COALESCE(?, name), device_id = NULL
            WHERE id = ?`,
        )
        .run(email, passwordHash, name && name.length > 0 ? name : null, existing.id);
      // Claiming can never drop a membership: the row already joined the shared
      // workspace as a guest, and a private workspace keeps its owner.
      joinSharedWorkspace(existing.id, now);
      return { ...existing, name: name && name.length > 0 ? name : existing.name, email };
    }

    const user: AccountUser = {
      id: newId("usr"),
      name: name && name.length > 0 ? name : email.split("@")[0]!,
      email,
    };
    getDb()
      .prepare(
        `INSERT INTO users (id, name, created_at, device_id, is_system, email, password_hash)
         VALUES (?, ?, ?, NULL, 0, ?, ?)`,
      )
      .run(user.id, user.name, now, email, passwordHash);
    joinSharedWorkspace(user.id, now);
    return user;
  });
}

/** The account for an email/password pair, or null for any mismatch. */
export function authenticate(rawEmail: string, password: string): AccountUser | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, email, password_hash AS passwordHash
         FROM users
        WHERE email = ? AND is_system = 0`,
    )
    .get(rawEmail.trim().toLowerCase()) as
    | (AccountUser & { passwordHash: string | null })
    | undefined;

  if (!row?.passwordHash) {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.passwordHash)) return null;
  return { id: row.id, name: row.name, email: row.email };
}

function tokenId(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Issues a session and returns the raw token, which only the cookie should hold. */
export function createSession(userId: string): SessionTicket {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(tokenId(token), userId, now.toISOString(), expires.toISOString(), now.toISOString());
  return { token, userId, expiresAt: expires.toISOString() };
}

/** Resolves a live session to its account and touches its last-seen time. */
export function resolveSession(token: string): AccountUser | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id AS id, u.name AS name, u.email AS email
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(tokenId(token), nowIso()) as AccountUser | undefined;
  if (!row) return null;
  getDb()
    .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
    .run(nowIso(), tokenId(token));
  return row;
}

export function revokeSession(token: string): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(tokenId(token));
}

/** Housekeeping for expired rows; cheap enough to call on sign-in. */
export function pruneExpiredSessions(): void {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
}
