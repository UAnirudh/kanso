import { z } from "zod";
import { getDb, newId, nowIso } from "../db";
import { notFound } from "../errors";
import type { AppRecord, TaskPriority, TaskStatus } from "../interface/types";

interface RecordRow {
  id: string;
  app_id: string;
  kind: "task" | "note";
  title: string;
  description: string;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  due_date: string | null;
  position: number;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapRecord(row: RecordRow): AppRecord {
  return {
    id: row.id,
    appId: row.app_id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.due_date,
    position: row.position,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable();

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, "A task needs a title.").max(140),
  description: z.string().max(2000).default(""),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: dateString.optional().default(null),
});

export const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: dateString.optional(),
});

export const noteCreateSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(2000).default(""),
});

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;
export type NoteCreateInput = z.infer<typeof noteCreateSchema>;

export function listRecords(appId: string, kind?: "task" | "note"): AppRecord[] {
  const rows = kind
    ? (getDb()
        .prepare(
          "SELECT * FROM app_records WHERE app_id = ? AND kind = ? ORDER BY position, created_at",
        )
        .all(appId, kind) as RecordRow[])
    : (getDb()
        .prepare("SELECT * FROM app_records WHERE app_id = ? ORDER BY position, created_at")
        .all(appId) as RecordRow[]);
  return rows.map(mapRecord);
}

export function getRecord(appId: string, recordId: string): AppRecord {
  const row = getDb()
    .prepare("SELECT * FROM app_records WHERE app_id = ? AND id = ?")
    .get(appId, recordId) as RecordRow | undefined;
  if (!row) throw notFound("That task no longer exists.");
  return mapRecord(row);
}

function nextPosition(appId: string): number {
  const row = getDb()
    .prepare("SELECT COALESCE(MAX(position), 0) AS max FROM app_records WHERE app_id = ?")
    .get(appId) as { max: number };
  return row.max + 10;
}

export function createTask(input: {
  appId: string;
  userId: string;
  data: TaskCreateInput;
}): AppRecord {
  const now = nowIso();
  const id = newId("rec");
  const completedAt = input.data.status === "done" ? now : null;
  getDb()
    .prepare(
      `INSERT INTO app_records
        (id, app_id, kind, title, description, status, priority, due_date, position,
         assignee_id, created_by, created_at, updated_at, completed_at)
       VALUES (?, ?, 'task', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.appId,
      input.data.title,
      input.data.description,
      input.data.status,
      input.data.priority,
      input.data.dueDate ?? null,
      nextPosition(input.appId),
      input.userId,
      now,
      now,
      completedAt,
    );
  return getRecord(input.appId, id);
}

export function updateTask(
  appId: string,
  recordId: string,
  patch: TaskUpdateInput,
): AppRecord {
  const existing = getRecord(appId, recordId);
  if (existing.kind !== "task") throw notFound("That task no longer exists.");

  const now = nowIso();
  const nextStatus = patch.status ?? existing.status;
  let completedAt = existing.completedAt;
  if (nextStatus === "done" && existing.status !== "done") completedAt = now;
  if (nextStatus !== "done") completedAt = null;

  getDb()
    .prepare(
      `UPDATE app_records
          SET title = ?, description = ?, status = ?, priority = ?,
              due_date = ?, updated_at = ?, completed_at = ?
        WHERE app_id = ? AND id = ?`,
    )
    .run(
      patch.title ?? existing.title,
      patch.description ?? existing.description,
      nextStatus,
      patch.priority ?? existing.priority,
      patch.dueDate === undefined ? existing.dueDate : patch.dueDate,
      now,
      completedAt,
      appId,
      recordId,
    );

  return getRecord(appId, recordId);
}

export function deleteRecord(appId: string, recordId: string): void {
  const result = getDb()
    .prepare("DELETE FROM app_records WHERE app_id = ? AND id = ?")
    .run(appId, recordId);
  if (result.changes === 0) throw notFound("That record no longer exists.");
}

export function createNote(input: {
  appId: string;
  userId: string;
  data: NoteCreateInput;
}): AppRecord {
  const now = nowIso();
  const id = newId("rec");
  getDb()
    .prepare(
      `INSERT INTO app_records
        (id, app_id, kind, title, description, status, priority, due_date, position,
         assignee_id, created_by, created_at, updated_at, completed_at)
       VALUES (?, ?, 'note', ?, ?, NULL, NULL, NULL, ?, NULL, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      input.appId,
      input.data.title,
      input.data.description,
      nextPosition(input.appId),
      input.userId,
      now,
      now,
    );
  return getRecord(input.appId, id);
}

export interface ActivityItem {
  id: string;
  taskId: string;
  title: string;
  action: "created" | "completed" | "reopened" | "updated";
  actorName: string;
  at: string;
}

export function listActivity(appId: string, limit = 8): ActivityItem[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id AS id, r.title AS title, r.status AS status, r.created_at AS createdAt,
              r.updated_at AS updatedAt, r.completed_at AS completedAt, u.name AS actorName
         FROM app_records r
         JOIN users u ON u.id = r.created_by
        WHERE r.app_id = ? AND r.kind = 'task'
        ORDER BY r.updated_at DESC
        LIMIT ?`,
    )
    .all(appId, limit) as Array<{
    id: string;
    title: string;
    status: TaskStatus | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    actorName: string;
  }>;

  return rows.map((row) => {
    let action: ActivityItem["action"] = "updated";
    if (row.status === "done" && row.completedAt === row.updatedAt) action = "completed";
    else if (row.createdAt === row.updatedAt) action = "created";
    else if (row.status === "done") action = "completed";
    else if (row.status === "todo" && row.completedAt === null) action = "reopened";
    return {
      id: `${row.id}:${row.updatedAt}`,
      taskId: row.id,
      title: row.title,
      action,
      actorName: row.actorName,
      at: row.updatedAt,
    };
  });
}
