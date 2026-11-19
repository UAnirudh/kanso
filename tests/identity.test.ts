import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The shared workspace must survive the one thing a guest identity cannot: its
 * browser losing the cookie. These tests run against a real migrated SQLite file
 * and assert the properties that make that true, plus the fact that no
 * account-era schema is left behind.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-identity-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let guests: typeof import("@/lib/repo/guests");
let workspaces: typeof import("@/lib/repo/workspaces");

beforeAll(async () => {
  db = await import("@/lib/db");
  guests = await import("@/lib/repo/guests");
  workspaces = await import("@/lib/repo/workspaces");
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function shared(): string {
  return workspaces.ensureSharedWorkspace();
}

describe("guest identity and the shared workspace", () => {
  it("mints exactly one guest row per device id", () => {
    const device = "a".repeat(32);
    const first = guests.resolveGuest(device);

    expect(guests.resolveGuest(device)).toEqual(first);
    expect(first.name).toBe("Guest AAAA");
    expect(guests.resolveGuest("b".repeat(32)).id).not.toBe(first.id);
  });

  it("is owned by Kanso itself, never by a browser", () => {
    const rows = db
      .getDb()
      .prepare("SELECT id, owner_id AS ownerId, is_shared AS isShared FROM workspaces")
      .all() as Array<{ id: string; ownerId: string; isShared: number }>;

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ownerId: workspaces.SHARED_OWNER_ID, isShared: 1 });
    expect(rows[0]!.id).toBe(shared());
  });

  it("keeps every guest an equal admin, so a cleared cookie cannot orphan it", () => {
    const workspaceId = shared();
    const first = guests.resolveGuest("c".repeat(32));
    expect(workspaces.getMembership(workspaceId, first.id)).toBe("admin");

    // A wiped cookie is simply a new device id, i.e. a new guest row.
    const replacement = guests.resolveGuest("d".repeat(32));
    expect(workspaces.getMembership(workspaceId, replacement.id)).toBe("admin");

    // ... and that replacement can retire the browser it no longer represents.
    workspaces.removeMember(workspaceId, first.id);
    expect(workspaces.getMembership(workspaceId, first.id)).toBeNull();
    expect(workspaces.listMembers(workspaceId).length).toBeGreaterThan(0);
  });

  it("keeps the system owner off the roster and untouchable", () => {
    const workspaceId = shared();
    expect(workspaces.getMembership(workspaceId, workspaces.SHARED_OWNER_ID)).toBe("owner");
    expect(
      workspaces
        .listMembers(workspaceId)
        .some((member) => member.userId === workspaces.SHARED_OWNER_ID),
    ).toBe(false);

    expect(() =>
      workspaces.updateMemberRole(workspaceId, workspaces.SHARED_OWNER_ID, "viewer"),
    ).toThrow(/cannot be changed/);

    // A guest cannot be promoted into owning the shared workspace either.
    const guest = guests.resolveGuest("e".repeat(32));
    expect(() => workspaces.updateMemberRole(workspaceId, guest.id, "owner")).toThrow(
      /cannot be owned/,
    );
    expect(() => workspaces.removeMember(workspaceId, workspaces.SHARED_OWNER_ID)).toThrow(
      /cannot be changed/,
    );
  });

  it("leaves no sign-in schema behind", () => {
    const database = db.getDb();
    const columns = (database.prepare("PRAGMA table_info(users)").all() as Array<{
      name: string;
    }>).map((column) => column.name);
    const tables = (
      database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((table) => table.name);

    expect(columns).toEqual(["id", "name", "created_at", "device_id", "is_system"]);
    expect(tables).not.toContain("sessions");
  });
});
