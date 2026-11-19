import { getDb, newId, nowIso, transaction } from "../db";
import { joinSharedWorkspace } from "./workspaces";

/** A guest is one browser: the row behind its workspace memberships. */
export interface Guest {
  id: string;
  name: string;
}

/** Human-readable, stable and unique enough to tell two browsers apart. */
export function guestName(deviceId: string): string {
  return `Guest ${deviceId.slice(0, 4).toUpperCase()}`;
}

function findByDevice(deviceId: string): Guest | null {
  const row = getDb()
    .prepare("SELECT id, name FROM users WHERE device_id = ?")
    .get(deviceId) as Guest | undefined;
  return row ?? null;
}

/**
 * Idempotent: the guest row for a device, created on first sight together with
 * its membership of the shared workspace.
 *
 * The unique index on `users.device_id` plus a re-check inside the write
 * transaction keep two simultaneous first requests from creating two guests for
 * one browser. The row is kept if the cookie later disappears, so its interface
 * documents and revisions are not thrown away; the next cookie simply becomes a
 * new guest that can still manage the workspace.
 */
export function resolveGuest(deviceId: string): Guest {
  const existing = findByDevice(deviceId);
  if (existing) return existing;

  return transaction(() => {
    const raced = findByDevice(deviceId);
    if (raced) return raced;

    const now = nowIso();
    const guest: Guest = { id: newId("usr"), name: guestName(deviceId) };
    getDb()
      .prepare("INSERT INTO users (id, name, created_at, device_id) VALUES (?, ?, ?, ?)")
      .run(guest.id, guest.name, now, deviceId);
    joinSharedWorkspace(guest.id, now);
    return guest;
  });
}
