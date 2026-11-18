import { getPages, type AppAccess } from "../repo/apps";
import type { InterfaceOperation } from "./operations";
import {
  applyOperations,
  cloneDocument,
  normalizeDocument,
  type ApplyResult,
} from "./engine";
import {
  createUserInterface,
  getRevision,
  listRevisions,
  previousRevisionDocument,
  readBaseDocument,
  readUserInterfaceDocument,
  saveUserInterface,
  type RevisionKind,
} from "./store";
import type { InterfaceDocument } from "./types";

export interface LoadedInterface {
  document: InterfaceDocument;
  pages: ReturnType<typeof getPages>;
  pageKeys: string[];
}

/**
 * Loads the calling user's interface. If they have never opened the app, their
 * personal interface is forked from the generated base definition and recorded
 * as their first revision, so teammates keep the original.
 */
export function loadInterface(access: AppAccess, userId: string): LoadedInterface {
  const pages = getPages(access.app.id);
  const pageKeys = pages.map((page) => page.key);
  const stored = readUserInterfaceDocument(access.app.id, userId);

  if (stored) {
    const normalized = normalizeDocument(stored, { pageKeys });
    return { document: normalized.document, pages, pageKeys };
  }

  const base = readBaseDocument(access.app.id, pages);
  const { document } = normalizeDocument(cloneDocument(base), { pageKeys });
  createUserInterface({
    appId: access.app.id,
    userId,
    document,
    label: "Starting interface",
    kind: "init",
  });
  return { document, pages, pageKeys };
}

export interface SaveResult {
  document: InterfaceDocument;
  revisionId: string;
  warnings: string[];
}

export function saveInterface(input: {
  access: AppAccess;
  userId: string;
  document: InterfaceDocument;
  kind: RevisionKind;
  label: string;
  operations?: unknown[];
  aiRequestId?: string | null;
}): SaveResult {
  const pages = getPages(input.access.app.id);
  const pageKeys = pages.map((page) => page.key);
  const normalized = normalizeDocument(input.document, { pageKeys });
  const { revisionId } = saveUserInterface({
    appId: input.access.app.id,
    userId: input.userId,
    document: normalized.document,
    kind: input.kind,
    label: input.label,
    operations: input.operations,
    aiRequestId: input.aiRequestId,
  });
  return { document: normalized.document, revisionId, warnings: normalized.warnings };
}

/** Shared entry point for AI proposals and visual editing. */
export function applyInterfaceOperations(input: {
  access: AppAccess;
  userId: string;
  operations: InterfaceOperation[];
  label: string;
  kind: RevisionKind;
  aiRequestId?: string | null;
}): SaveResult & { applied: ApplyResult["applied"] } {
  const { document, pageKeys } = loadInterface(input.access, input.userId);
  const result = applyOperations(document, input.operations, { pageKeys });
  const saved = saveInterface({
    access: input.access,
    userId: input.userId,
    document: result.document,
    kind: input.kind,
    label: input.label,
    operations: input.operations,
    aiRequestId: input.aiRequestId,
  });
  return { ...saved, applied: result.applied, warnings: result.warnings };
}

export function restoreInterfaceVersion(input: {
  access: AppAccess;
  userId: string;
  revisionId: string;
}): SaveResult {
  const revision = getRevision(input.access.app.id, input.userId, input.revisionId);
  if (!revision) {
    throw new Error("That version does not exist or belongs to another user.");
  }
  return saveInterface({
    access: input.access,
    userId: input.userId,
    document: revision.document,
    kind: "restore",
    label: `Restored “${revision.label}”`,
  });
}

export function undoInterfaceChange(input: {
  access: AppAccess;
  userId: string;
}): SaveResult {
  const previous = previousRevisionDocument(input.access.app.id, input.userId);
  if (!previous) {
    throw new Error("There is no earlier version to undo to.");
  }
  return saveInterface({
    access: input.access,
    userId: input.userId,
    document: previous,
    kind: "undo",
    label: "Undid the last interface change",
  });
}

export function interfaceHistory(access: AppAccess, userId: string) {
  return listRevisions(access.app.id, userId).map((revision) => ({
    id: revision.id,
    kind: revision.kind,
    label: revision.label,
    createdAt: revision.createdAt,
    operations: revision.operations,
  }));
}
