import { getDb, newId, nowIso } from "../db";
import type { AppPage, InterfaceDocument, InterfaceNode, PageSurface } from "./types";
import { createEmptyDocument, normalizeDocument } from "./engine";

export type RevisionKind = "init" | "ai" | "manual" | "restore" | "undo";

export interface RevisionSummary {
  id: string;
  kind: RevisionKind;
  label: string;
  createdAt: string;
  operations: unknown[];
}

interface RevisionRow {
  id: string;
  kind: RevisionKind;
  label: string;
  document: string;
  operations: string;
  created_at: string;
}

export function writeBaseDefinition(
  appId: string,
  pageKey: string,
  page: PageSurface,
): void {
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO interface_definitions (id, app_id, page_key, definition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (app_id, page_key) DO UPDATE SET definition = excluded.definition, updated_at = excluded.updated_at`,
    )
    .run(newId("idef"), appId, pageKey, JSON.stringify(page), now, now);
}

export function readBaseDocument(appId: string, pages: AppPage[]): InterfaceDocument {
  const rows = getDb()
    .prepare("SELECT page_key, definition FROM interface_definitions WHERE app_id = ?")
    .all(appId) as Array<{ page_key: string; definition: string }>;

  if (rows.length === 0) {
    return createEmptyDocument(pages.map((page) => page.key));
  }

  const document = createEmptyDocument(pages.map((page) => page.key));
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.definition) as PageSurface;
      if (document.pages[row.page_key]) {
        document.pages[row.page_key] = parsed;
      }
    } catch {
      // Corrupt base definition: the page keeps its generated default.
    }
  }
  return normalizeDocument(document, { pageKeys: pages.map((page) => page.key) }).document;
}

interface UserInterfaceRow {
  id: string;
  document: string;
  updated_at: string;
}

function findInterfaceRow(appId: string, userId: string): UserInterfaceRow | undefined {
  return getDb()
    .prepare("SELECT id, document, updated_at FROM user_interfaces WHERE app_id = ? AND user_id = ?")
    .get(appId, userId) as UserInterfaceRow | undefined;
}

export function readUserInterfaceDocument(
  appId: string,
  userId: string,
): InterfaceDocument | null {
  const row = findInterfaceRow(appId, userId);
  if (!row) return null;
  try {
    return JSON.parse(row.document) as InterfaceDocument;
  } catch {
    return null;
  }
}

export function createUserInterface(input: {
  appId: string;
  userId: string;
  document: InterfaceDocument;
  label: string;
  kind?: RevisionKind;
}): InterfaceDocument {
  const db = getDb();
  const now = nowIso();
  const id = newId("uif");
  const existing = findInterfaceRow(input.appId, input.userId);
  if (existing) {
    db.prepare(
      "UPDATE user_interfaces SET document = ?, updated_at = ? WHERE id = ?",
    ).run(JSON.stringify(input.document), now, existing.id);
    if (input.kind !== "init") {
      db.prepare(
        `INSERT INTO interface_revisions
          (id, user_interface_id, app_id, user_id, kind, label, document, operations, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      ).run(
        newId("rev"),
        existing.id,
        input.appId,
        input.userId,
        input.kind ?? "manual",
        input.label,
        JSON.stringify(input.document),
        now,
      );
    }
    return input.document;
  }

  db.prepare(
    "INSERT INTO user_interfaces (id, app_id, user_id, document, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, input.appId, input.userId, JSON.stringify(input.document), now);
  db.prepare(
    `INSERT INTO interface_revisions
      (id, user_interface_id, app_id, user_id, kind, label, document, operations, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
  ).run(
    newId("rev"),
    id,
    input.appId,
    input.userId,
    input.kind ?? "init",
    input.label,
    JSON.stringify(input.document),
    now,
  );
  return input.document;
}

export function saveUserInterface(input: {
  appId: string;
  userId: string;
  document: InterfaceDocument;
  kind: RevisionKind;
  label: string;
  operations?: unknown[];
  aiRequestId?: string | null;
}): { revisionId: string } {
  const db = getDb();
  const now = nowIso();
  const row = findInterfaceRow(input.appId, input.userId);
  const interfaceId = row?.id ?? newId("uif");
  const revisionId = newId("rev");

  const write = db.transaction(() => {
    if (row) {
      db.prepare("UPDATE user_interfaces SET document = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify(input.document),
        now,
        interfaceId,
      );
    } else {
      db.prepare(
        "INSERT INTO user_interfaces (id, app_id, user_id, document, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(interfaceId, input.appId, input.userId, JSON.stringify(input.document), now);
    }
    db.prepare(
      `INSERT INTO interface_revisions
        (id, user_interface_id, app_id, user_id, kind, label, document, operations, ai_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      revisionId,
      interfaceId,
      input.appId,
      input.userId,
      input.kind,
      input.label,
      JSON.stringify(input.document),
      JSON.stringify(input.operations ?? []),
      input.aiRequestId ?? null,
      now,
    );
  });
  write();

  return { revisionId };
}

export function listRevisions(
  appId: string,
  userId: string,
  limit = 40,
): Array<RevisionSummary & { document: InterfaceDocument }> {
  const rows = getDb()
    .prepare(
      `SELECT id, kind, label, document, operations, created_at
         FROM interface_revisions
        WHERE app_id = ? AND user_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?`,
    )
    .all(appId, userId, limit) as RevisionRow[];

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    createdAt: row.created_at,
    operations: safeParseArray(row.operations),
    document: JSON.parse(row.document) as InterfaceDocument,
  }));
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getRevision(
  appId: string,
  userId: string,
  revisionId: string,
): (RevisionSummary & { document: InterfaceDocument }) | null {
  const row = getDb()
    .prepare(
      "SELECT id, kind, label, document, operations, created_at FROM interface_revisions WHERE app_id = ? AND user_id = ? AND id = ?",
    )
    .get(appId, userId, revisionId) as RevisionRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    createdAt: row.created_at,
    operations: safeParseArray(row.operations),
    document: JSON.parse(row.document) as InterfaceDocument,
  };
}

/** Document state before the newest revision, used by undo. */
export function previousRevisionDocument(
  appId: string,
  userId: string,
): InterfaceDocument | null {
  const rows = getDb()
    .prepare(
      `SELECT document FROM interface_revisions
        WHERE app_id = ? AND user_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 2`,
    )
    .all(appId, userId) as Array<{ document: string }>;
  if (rows.length < 2) return null;
  return JSON.parse(rows[1]!.document) as InterfaceDocument;
}

export function replaceNode(page: PageSurface, node: InterfaceNode): void {
  const index = page.components.findIndex((candidate) => candidate.id === node.id);
  if (index >= 0) page.components[index] = node;
}
