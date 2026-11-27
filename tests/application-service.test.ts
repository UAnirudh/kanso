import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Renaming and deleting an application changes what every member of the
 * workspace sees, so the rule belongs to the service layer rather than to the
 * server action that happens to call it. These tests assert the rule holds for
 * each kind of caller against a real migrated database.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-apps-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let guests: typeof import("@/lib/repo/guests");
let workspaces: typeof import("@/lib/repo/workspaces");
let apps: typeof import("@/lib/repo/apps");
let generation: typeof import("@/lib/services/generation");
let HttpError: typeof import("@/lib/errors").HttpError;

let workspaceId: string;
let adminId: string;
let appId: string;

beforeAll(async () => {
  db = await import("@/lib/db");
  guests = await import("@/lib/repo/guests");
  workspaces = await import("@/lib/repo/workspaces");
  apps = await import("@/lib/repo/apps");
  generation = await import("@/lib/services/generation");
  HttpError = (await import("@/lib/errors")).HttpError;

  workspaceId = workspaces.ensureSharedWorkspace();
  adminId = guests.resolveGuest("1".repeat(32)).id;
  appId = generation.generateApplication({
    userId: adminId,
    workspaceId,
    prompt: "A project workspace with a kanban board and delivery analytics",
    name: "Managed app",
  }).app.id;
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function statusOf(run: () => unknown): number | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof HttpError ? error.status : -1;
  }
}

describe("application management is authorized in the service", () => {
  it("lets a workspace admin rename an application", () => {
    generation.renameApplication({ appId, userId: adminId, name: "Renamed app" });
    expect(apps.getApp(appId)?.name).toBe("Renamed app");
  });

  it("rejects a rename from a member who is only a viewer", () => {
    const viewer = guests.resolveGuest("2".repeat(32));
    workspaces.updateMemberRole(workspaceId, viewer.id, "viewer");

    expect(
      statusOf(() =>
        generation.renameApplication({ appId, userId: viewer.id, name: "Viewer's app" }),
      ),
    ).toBe(403);
    expect(apps.getApp(appId)?.name).toBe("Renamed app");
  });

  it("refuses to delete for a viewer, and for a browser outside the workspace", () => {
    const viewer = guests.resolveGuest("3".repeat(32));
    workspaces.updateMemberRole(workspaceId, viewer.id, "viewer");
    expect(() => generation.deleteApplication({ appId, userId: viewer.id })).toThrow(
      /Only workspace admins can delete applications/,
    );

    const outsider = guests.resolveGuest("4".repeat(32));
    workspaces.removeMember(workspaceId, outsider.id);
    expect(statusOf(() => generation.deleteApplication({ appId, userId: outsider.id }))).toBe(403);

    expect(apps.getApp(appId)).not.toBeNull();
  });

  it("rejects an empty or oversized name before it reaches the database", () => {
    expect(statusOf(() => generation.renameApplication({ appId, userId: adminId, name: "  " }))).toBe(
      400,
    );
    expect(
      statusOf(() =>
        generation.renameApplication({ appId, userId: adminId, name: "x".repeat(61) }),
      ),
    ).toBe(400);
    expect(apps.getApp(appId)?.name).toBe("Renamed app");
  });

  it("deletes the application for an admin", () => {
    generation.deleteApplication({ appId, userId: adminId });
    expect(apps.getApp(appId)).toBeNull();
  });
});
