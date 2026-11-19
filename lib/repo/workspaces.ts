import { getDb, newId, nowIso } from "../db";
import { HttpError } from "../errors";

export type { Role } from "../roles";
export { ROLE_LABEL } from "../roles";
import type { Role } from "../roles";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  role: Role;
  createdAt: string;
}

/**
 * Kanso has no accounts, so the one shared workspace belongs to a system
 * identity rather than to a browser. A browser's guest row is disposable — a
 * cleared cookie loses it — and an owner that can disappear would leave the
 * workspace with nobody allowed to change a role or retire a stale guest.
 *
 * The role a guest joins with is therefore the same for everyone, and roles stay
 * meaningful through private workspaces (owned by the guest that created them)
 * and through demotion: a `viewer` can still read but not write.
 */
export const SHARED_OWNER_ID = "usr_shared_owner";
export const SHARED_WORKSPACE_NAME = "Kanso workspace";
export const SHARED_MEMBER_ROLE: Role = "admin";

function sharedWorkspaceId(): string | null {
  const row = getDb()
    .prepare("SELECT id FROM workspaces WHERE is_shared = 1 ORDER BY created_at LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

function ensureSystemOwner(now: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO users (id, name, created_at, device_id, is_system)
       VALUES (?, ?, ?, NULL, 1)`,
    )
    .run(SHARED_OWNER_ID, SHARED_WORKSPACE_NAME, now);
}

/** The shared workspace, created on a fresh database. */
export function ensureSharedWorkspace(now: string = nowIso()): string {
  const existing = sharedWorkspaceId();
  if (existing) return existing;

  ensureSystemOwner(now);
  const workspace = createWorkspace(SHARED_OWNER_ID, SHARED_WORKSPACE_NAME);
  getDb().prepare("UPDATE workspaces SET is_shared = 1 WHERE id = ?").run(workspace.id);
  return workspace.id;
}

/** Adds a guest to the shared workspace without disturbing an existing role. */
export function joinSharedWorkspace(userId: string, now: string = nowIso()): string {
  const workspaceId = ensureSharedWorkspace(now);
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(workspaceId, userId, SHARED_MEMBER_ROLE, now);
  return workspaceId;
}

export function createWorkspace(ownerId: string, name: string): Workspace {
  const db = getDb();
  const workspace: Workspace = {
    id: newId("wsp"),
    name: name.trim(),
    ownerId,
    createdAt: nowIso(),
  };
  const create = db.transaction(() => {
    db.prepare(
      "INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)",
    ).run(workspace.id, workspace.name, workspace.ownerId, workspace.createdAt);
    db.prepare(
      "INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
    ).run(workspace.id, ownerId, workspace.createdAt);
  });
  create();
  return workspace;
}

export function getWorkspace(id: string): Workspace | null {
  const row = getDb()
    .prepare("SELECT id, name, owner_id, created_at FROM workspaces WHERE id = ?")
    .get(id) as
    | { id: string; name: string; owner_id: string; created_at: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export function getMembership(workspaceId: string, userId: string): Role | null {
  const row = getDb()
    .prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .get(workspaceId, userId) as { role: Role } | undefined;
  return row?.role ?? null;
}

/** The roster browsers see: guests only, so the system owner never appears. */
export function listMembers(workspaceId: string): Member[] {
  return getDb()
    .prepare(
      `SELECT m.user_id AS userId, m.role AS role, m.created_at AS createdAt, u.name AS name
         FROM workspace_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ? AND u.is_system = 0
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,
                 u.name`,
    )
    .all(workspaceId) as Member[];
}

export function listWorkspacesForUser(userId: string): Array<Workspace & { role: Role }> {
  return getDb()
    .prepare(
      `SELECT w.id AS id, w.name AS name, w.owner_id AS ownerId,
              w.created_at AS createdAt, m.role AS role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.user_id = ?
        ORDER BY w.created_at`,
    )
    .all(userId) as Array<Workspace & { role: Role }>;
}

/** Resolves a membership that may be edited, rejecting the system owner. */
function editableRole(workspaceId: string, userId: string): Role {
  const row = getDb()
    .prepare(
      `SELECT m.role AS role, u.is_system AS isSystem
         FROM workspace_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ? AND m.user_id = ?`,
    )
    .get(workspaceId, userId) as { role: Role; isSystem: number } | undefined;
  if (!row) throw new HttpError(404, "That browser is not a member of this workspace.");
  if (row.isSystem) {
    throw new HttpError(403, "The shared workspace itself cannot be changed.");
  }
  return row.role;
}

function isSharedWorkspace(workspaceId: string): boolean {
  const row = getDb()
    .prepare("SELECT is_shared FROM workspaces WHERE id = ?")
    .get(workspaceId) as { is_shared: number } | undefined;
  return row?.is_shared === 1;
}

export function updateMemberRole(workspaceId: string, userId: string, role: Role): void {
  const current = editableRole(workspaceId, userId);
  // Promotion to owner is how a browser could take the shared workspace back and
  // make it unmanageable again once its cookie is gone.
  if (role === "owner" && isSharedWorkspace(workspaceId)) {
    throw new HttpError(403, "The shared workspace cannot be owned by a browser.");
  }
  if (current === "owner") {
    throw new HttpError(403, "The workspace owner cannot be demoted.");
  }
  getDb()
    .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?")
    .run(role, workspaceId, userId);
}

/**
 * Ends one browser's access. The guest row and its personal interface stay, so a
 * cleared cookie does not erase anything, and removal is how a stale browser is
 * retired from the roster.
 */
export function removeMember(workspaceId: string, userId: string): void {
  if (editableRole(workspaceId, userId) === "owner") {
    throw new HttpError(403, "The owner cannot be removed.");
  }
  getDb()
    .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .run(workspaceId, userId);
}
