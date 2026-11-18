import type { AppPage } from "../interface/types";
import { getDb, newId, nowIso } from "../db";
import { forbidden, notFound } from "../errors";
import { getMembership, getWorkspace, type Role, type Workspace } from "./workspaces";

export interface App {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  template: string;
  createdBy: string;
  createdAt: string;
}

export interface AppSummary extends App {
  workspaceName: string;
  role: Role;
  taskCount: number;
  openCount: number;
}

export interface AppAccess {
  app: App;
  workspace: Workspace;
  role: Role;
  canEdit: boolean;
  canManage: boolean;
}

interface AppRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  template: string;
  created_by: string;
  created_at: string;
}

function mapApp(row: AppRow): App {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    template: row.template,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function getApp(appId: string): App | null {
  const row = getDb().prepare("SELECT * FROM apps WHERE id = ?").get(appId) as
    | AppRow
    | undefined;
  return row ? mapApp(row) : null;
}

export function getPages(appId: string): AppPage[] {
  return getDb()
    .prepare(
      "SELECT id, key, title, icon, sort FROM app_pages WHERE app_id = ? ORDER BY sort, title",
    )
    .all(appId) as AppPage[];
}

/** Resolves a user's role on an app through workspace membership. */
export function getAppAccess(appId: string, userId: string): AppAccess | null {
  const app = getApp(appId);
  if (!app) return null;
  const role = getMembership(app.workspaceId, userId);
  if (!role) return null;
  const workspace = getWorkspace(app.workspaceId);
  if (!workspace) return null;
  return {
    app,
    workspace,
    role,
    canEdit: role === "owner" || role === "admin" || role === "member",
    canManage: role === "owner" || role === "admin",
  };
}

export function requireAppAccess(appId: string, userId: string): AppAccess {
  const app = getApp(appId);
  if (!app) throw notFound("That application does not exist.");
  const access = getAppAccess(appId, userId);
  if (!access) throw forbidden("You are not a member of this workspace.");
  return access;
}

export function listAppsForUser(userId: string): AppSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT a.*, w.name AS workspace_name, m.role AS role,
              (SELECT COUNT(*) FROM app_records r WHERE r.app_id = a.id AND r.kind = 'task') AS task_count,
              (SELECT COUNT(*) FROM app_records r WHERE r.app_id = a.id AND r.kind = 'task' AND r.status != 'done') AS open_count
         FROM apps a
         JOIN workspaces w ON w.id = a.workspace_id
         JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
        ORDER BY a.created_at DESC`,
    )
    .all(userId) as Array<
    AppRow & {
      workspace_name: string;
      role: Role;
      task_count: number;
      open_count: number;
    }
  >;

  return rows.map((row) => ({
    ...mapApp(row),
    workspaceName: row.workspace_name,
    role: row.role,
    taskCount: row.task_count,
    openCount: row.open_count,
  }));
}

export function insertApp(input: {
  workspaceId: string;
  name: string;
  description: string;
  template: string;
  createdBy: string;
  pages: Array<{ key: string; title: string; icon: string }>;
}): { app: App; pages: AppPage[] } {
  const db = getDb();
  const app: App = {
    id: newId("app"),
    workspaceId: input.workspaceId,
    name: input.name.trim(),
    description: input.description.trim(),
    template: input.template,
    createdBy: input.createdBy,
    createdAt: nowIso(),
  };

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO apps (id, workspace_id, name, description, template, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      app.id,
      app.workspaceId,
      app.name,
      app.description,
      app.template,
      app.createdBy,
      app.createdAt,
    );

    input.pages.forEach((page, index) => {
      db.prepare(
        "INSERT INTO app_pages (id, app_id, key, title, icon, sort) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(newId("page"), app.id, page.key, page.title, page.icon, index);
    });
  });
  insert();

  return { app, pages: getPages(app.id) };
}

export function updateApp(
  appId: string,
  input: { name?: string; description?: string },
): App {
  const app = getApp(appId);
  if (!app) throw notFound("That application does not exist.");
  getDb()
    .prepare("UPDATE apps SET name = ?, description = ? WHERE id = ?")
    .run(
      input.name?.trim() || app.name,
      input.description?.trim() ?? app.description,
      appId,
    );
  return { ...app, name: input.name?.trim() || app.name, description: input.description ?? app.description };
}
