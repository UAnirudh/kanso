import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, newId, nowIso, transaction } from "./db";
import { HttpError, unauthorized } from "./errors";
import { createWorkspace } from "./repo/workspaces";

/**
 * Kanso has no sign-in for now.
 *
 * Each browser is handed one opaque device id in an httpOnly cookie, and that id
 * is the identity behind every workspace row (apps, records, memberships and the
 * personal interface document). It is a stable workspace identity, deliberately
 * not a security boundary: anyone with the URL can open the app, and clearing the
 * cookie starts a fresh, empty identity.
 *
 * The cookie is minted by `GET /api/device`, the only place allowed to write it,
 * because Server Components cannot set cookies during render.
 */
export const DEVICE_COOKIE = "kanso_device";
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DEVICE_PATTERN = /^[a-f0-9]{32}$/;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export function newDeviceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function isDeviceId(value: string | null | undefined): value is string {
  return Boolean(value && DEVICE_PATTERN.test(value));
}

/** Human-readable, stable and unique enough to tell two browsers apart. */
export function guestName(deviceId: string): string {
  return `Guest ${deviceId.slice(0, 4).toUpperCase()}`;
}

interface GuestRow {
  id: string;
  name: string;
  email: string;
}

function findByDevice(deviceId: string): GuestRow | null {
  const row = getDb()
    .prepare("SELECT id, name, email FROM users WHERE device_id = ?")
    .get(deviceId) as GuestRow | undefined;
  return row ?? null;
}

function sharedWorkspaceId(): string | null {
  const row = getDb()
    .prepare("SELECT id FROM workspaces WHERE is_shared = 1 ORDER BY created_at LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * Idempotent: resolves the guest row for a device, creating it (and joining the
 * shared workspace) on first sight. Two simultaneous first requests are handled
 * by the unique index on `users.device_id` plus a re-check inside the write
 * transaction, so exactly one guest row and one shared workspace are created.
 */
export function resolveDeviceUser(deviceId: string): AuthUser {
  const existing = findByDevice(deviceId);
  if (existing) return existing;

  return transaction(() => {
    const raced = findByDevice(deviceId);
    if (raced) return raced;

    const id = newId("usr");
    const name = guestName(deviceId);
    const email = `guest-${deviceId.slice(0, 12)}@device.kanso.local`;
    const now = nowIso();

    getDb()
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, created_at, device_id, is_anonymous)
         VALUES (?, ?, ?, 'no-sign-in', ?, ?, 1)`,
      )
      .run(id, email, name, now, deviceId);

    const shared = sharedWorkspaceId();
    if (shared) {
      getDb()
        .prepare(
          `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
           VALUES (?, ?, 'member', ?)`,
        )
        .run(shared, id, now);
    } else {
      // The first browser owns the shared workspace; everyone else joins as member.
      const workspace = createWorkspace(id, "Kanso workspace");
      getDb().prepare("UPDATE workspaces SET is_shared = 1 WHERE id = ?").run(workspace.id);
    }

    return { id, name, email };
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  return isDeviceId(deviceId) ? resolveDeviceUser(deviceId) : null;
}

/** Page-level guard: sends a cookieless browser through identity minting. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/api/device");
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
