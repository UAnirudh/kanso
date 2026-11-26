import { getDb, newId, nowIso } from "../db";
import { badRequest, forbidden, notFound } from "../errors";
import { insertApp, requireAppAccess, updateApp, type App, type AppAccess } from "../repo/apps";
import { getMembership, type Role } from "../repo/workspaces";
import { buildDocumentFromTemplate, selectTemplate } from "../interface/templates";
import { writeBaseDefinition, createUserInterface } from "../interface/store";
import type { InterfaceDocument } from "../interface/types";
import type { AppRecord, TaskPriority, TaskStatus } from "../interface/types";

export interface GenerationResult {
  app: App;
  document: InterfaceDocument;
  seededTasks: number;
}

function nodeIdFactory(): () => string {
  return () => `cmp_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function relativeDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

interface SeedTask {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueOffset: number | null;
  description?: string;
}

const PROJECT_SEEDS: SeedTask[] = [
  {
    title: "Draft the Q3 product brief",
    status: "done",
    priority: "high",
    dueOffset: -6,
    description: "Outline goals, non-goals and the metric we are moving.",
  },
  {
    title: "Review the onboarding flow",
    status: "in_progress",
    priority: "high",
    dueOffset: 2,
  },
  { title: "Fix billing webhook retries", status: "todo", priority: "urgent", dueOffset: 1 },
  {
    title: "Ship changelog for 2.4",
    status: "todo",
    priority: "medium",
    dueOffset: -2,
    description: "Overdue on purpose so the UI has something to prioritise.",
  },
  { title: "Design empty states", status: "in_progress", priority: "medium", dueOffset: 5 },
  { title: "Interview three customers", status: "todo", priority: "low", dueOffset: 7 },
  {
    title: "Archive stale experiment flags",
    status: "done",
    priority: "low",
    dueOffset: -11,
  },
  { title: "Triage support inbox", status: "todo", priority: "medium", dueOffset: 3 },
];

const PERSONAL_SEEDS: SeedTask[] = [
  { title: "Plan the week", status: "in_progress", priority: "medium", dueOffset: 0 },
  { title: "Ship the side project update", status: "todo", priority: "high", dueOffset: -1 },
  { title: "Read 30 pages", status: "todo", priority: "low", dueOffset: 1 },
  { title: "Long run", status: "done", priority: "medium", dueOffset: -3 },
  { title: "Inbox to zero", status: "todo", priority: "medium", dueOffset: 2 },
];

const NOTES = [
  {
    title: "Decision log",
    description:
      "Agreed to keep the shared data model fixed and let each person arrange their own interface.",
  },
  {
    title: "Open question",
    description: "Should overdue tasks float to the top of every list by default?",
  },
];

export function generateApplication(input: {
  userId: string;
  workspaceId: string;
  prompt: string;
  name?: string;
}): GenerationResult {
  const role: Role | null = getMembership(input.workspaceId, input.userId);
  if (!role) throw notFound("That workspace does not exist.");
  if (role === "viewer") {
    throw forbidden("Viewers cannot create applications. Ask an admin for edit access.");
  }

  const template = selectTemplate(input.prompt);
  const appName =
    input.name?.trim() ||
    (template.id === "personal" ? "Personal tracker" : "Project workspace");

  const pages = template.pages.map((page) => ({
    key: page.key,
    title: page.title,
    icon: page.icon,
  }));

  const { app, pages: createdPages } = insertApp({
    workspaceId: input.workspaceId,
    name: appName,
    description: input.prompt.trim(),
    template: template.id,
    createdBy: input.userId,
    pages,
  });

  const document = buildDocumentFromTemplate(template, {
    idFactory: nodeIdFactory(),
    theme: "light",
  });

  for (const page of template.pages) {
    const surface = document.pages[page.key];
    if (surface) writeBaseDefinition(app.id, page.key, surface);
  }

  createUserInterface({
    appId: app.id,
    userId: input.userId,
    document,
    label: "Generated from your description",
    kind: "init",
  });

  const db = getDb();
  const now = nowIso();
  const seeds = template.id === "personal" ? PERSONAL_SEEDS : PROJECT_SEEDS;

  const insertSeeds = db.transaction(() => {
    seeds.forEach((seed, index) => {
      db.prepare(
        `INSERT INTO app_records
          (id, app_id, kind, title, description, status, priority, due_date, position,
           assignee_id, created_by, created_at, updated_at, completed_at)
         VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      ).run(
        newId("rec"),
        app.id,
        seed.title,
        seed.description ?? "",
        seed.status,
        seed.priority,
        seed.dueOffset === null ? null : relativeDate(seed.dueOffset),
        (index + 1) * 10,
        input.userId,
        now,
        now,
        seed.status === "done" ? now : null,
      );
    });
    NOTES.forEach((note, index) => {
      db.prepare(
        `INSERT INTO app_records
          (id, app_id, kind, title, description, status, priority, due_date, position,
           assignee_id, created_by, created_at, updated_at, completed_at)
         VALUES (?, ?, 'note', ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, NULL)`,
      ).run(
        newId("rec"),
        app.id,
        note.title,
        note.description,
        900 + index,
        input.userId,
        now,
        now,
      );
    });
  });
  insertSeeds();

  void createdPages;
  return { app, document, seededTasks: seeds.length };
}

/**
 * Renaming and deleting an application changes the workspace everyone shares, so
 * the check lives here rather than in the route or server action that calls it:
 * every entry point gets the same answer, and a new caller cannot forget it.
 */
function requireManageableApp(
  appId: string,
  userId: string,
  action: "rename" | "delete",
): AppAccess {
  const access = requireAppAccess(appId, userId);
  if (!access.canManage) {
    throw forbidden(`Only workspace admins can ${action} applications.`);
  }
  return access;
}

export function renameApplication(input: {
  appId: string;
  userId: string;
  name: string;
  description?: string;
}): App {
  const access = requireManageableApp(input.appId, input.userId, "rename");
  const name = input.name.trim();
  if (name.length < 2) throw badRequest("Give the application a name.");
  if (name.length > 60) throw badRequest("Keep the name under 60 characters.");
  return updateApp(access.app.id, { name, description: input.description });
}

export function deleteApplication(input: { appId: string; userId: string }): void {
  const access = requireManageableApp(input.appId, input.userId, "delete");
  getDb().prepare("DELETE FROM apps WHERE id = ?").run(access.app.id);
}

export type { AppRecord };
