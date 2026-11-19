import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { unauthorized } from "./errors";
import { resolveGuest, type Guest } from "./repo/guests";

export type { Guest } from "./repo/guests";

/**
 * Kanso has no sign-in.
 *
 * Each browser is handed one opaque device id in an httpOnly cookie, and that id
 * is the identity behind every workspace row (apps, records, memberships and the
 * personal interface document). It is a stable workspace identity, deliberately
 * not a security boundary: anyone with the URL can open the app, and clearing the
 * cookie starts a fresh identity.
 *
 * The cookie is minted by `GET /api/device`, the only place allowed to write it,
 * because Server Components cannot set cookies during render.
 */
export const DEVICE_COOKIE = "kanso_device";
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const DEVICE_PATTERN = /^[a-f0-9]{32}$/;

export function newDeviceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function isDeviceId(value: string | null | undefined): value is string {
  return Boolean(value && DEVICE_PATTERN.test(value));
}

export async function getGuest(): Promise<Guest | null> {
  const jar = await cookies();
  const deviceId = jar.get(DEVICE_COOKIE)?.value;
  return isDeviceId(deviceId) ? resolveGuest(deviceId) : null;
}

/** Page guard: sends a cookieless browser through identity minting. */
export async function requireGuest(): Promise<Guest> {
  const guest = await getGuest();
  if (!guest) redirect("/api/device");
  return guest;
}

/** API-route variant: throws a 401 instead of redirecting. */
export async function requireApiGuest(): Promise<Guest> {
  const guest = await getGuest();
  if (!guest) throw unauthorized();
  return guest;
}
