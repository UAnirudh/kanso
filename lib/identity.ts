import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unauthorized } from "./errors";
import { resolveGuest, type Guest } from "./repo/guests";
import { resolveSession } from "./repo/accounts";

export type { Guest } from "./repo/guests";

/**
 * Two identities share one resolution path.
 *
 * A browser always carries an opaque device id in an httpOnly cookie, and that
 * id names its guest row. When the person has signed in, an account session
 * cookie takes precedence: the session's row is the same row the guest claimed,
 * so the interface documents and workspace role attached to it come with them,
 * on this device and any other.
 *
 * The cookie is minted by `GET /api/device`, the only place allowed to write it,
 * because Server Components cannot set cookies during render. Sessions are
 * written by the sign-in server actions for the same reason.
 */
export const DEVICE_COOKIE = "kanso_device";
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SESSION_COOKIE = "kanso_session";
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const DEVICE_PATTERN = /^[a-f0-9]{32}$/;

/** A viewer is a guest row, optionally backed by account credentials. */
export type Viewer = Guest & { email?: string | null };

export function newDeviceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function isDeviceId(value: string | null | undefined): value is string {
  return Boolean(value && DEVICE_PATTERN.test(value));
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}

export async function getViewer(): Promise<Viewer | null> {
  const jar = await cookies();

  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const account = resolveSession(token);
    if (account) {
      return { id: account.id, name: account.name, email: account.email };
    }
  }

  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  return isDeviceId(deviceId) ? resolveGuest(deviceId) : null;
}

/** Kept as the name the rest of the app used before accounts returned. */
export async function getGuest(): Promise<Viewer | null> {
  return getViewer();
}

/** Page guard: sends a cookieless browser through identity minting. */
export async function requireGuest(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/api/device");
  return viewer;
}

/** API-route variant: throws a 401 instead of redirecting. */
export async function requireApiGuest(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw unauthorized();
  return viewer;
}
