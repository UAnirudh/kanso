import { getDb, newId, nowIso } from "../db";
import { HttpError } from "../errors";
import type { Role } from "../roles";

export type { Role } from "../roles";
export { ROLE_LABEL } from "../roles";
import { ROLE_LABEL } from "../roles";

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
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

export function listMembers(workspaceId: string): Member[] {
  return getDb()
    .prepare(
      `SELECT m.user_id AS userId, m.role AS role, m.created_at AS createdAt,
              u.name AS name, u.email AS email
         FROM workspace_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.workspace_id = ?
        ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, u.name`,
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

export function updateMemberRole(workspaceId: string, userId: string, role: Role): void {
  const membership = getMembership(workspaceId, userId);
  if (!membership) throw new HttpError(404, "That person is not a member of this workspace.");
  if (membership === "owner") throw new HttpError(403, "The workspace owner cannot be demoted.");
  getDb()
    .prepare("UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?")
    .run(role, workspaceId, userId);
}

export function removeMember(workspaceId: string, userId: string): void {
  const membership = getMembership(workspaceId, userId);
  if (membership === "owner") throw new HttpError(403, "The owner cannot be removed.");
  getDb()
    .prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .run(workspaceId, userId);
}
