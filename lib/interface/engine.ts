import { CATALOG, isComponentType, normalizeProps } from "./catalog";
import type { InterfaceOperation } from "./operations";
import {
  ACCENTS,
  COMPONENT_TYPES,
  DENSITIES,
  PAGE_LAYOUTS,
  THEMES,
  type ComponentType,
  type DataSourceKey,
  type InterfaceDocument,
  type InterfaceNode,
  type PageSurface,
} from "./types";

export class InterfaceValidationError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "InterfaceValidationError";
    this.details = details;
  }
}

export interface EngineContext {
  /** Page keys that exist for this application, in display order. */
  pageKeys: string[];
  now?: () => Date;
}

export interface AppliedOperation {
  op: InterfaceOperation["op"];
  page?: string;
  target?: string;
  description: string;
}

export interface ApplyResult {
  document: InterfaceDocument;
  applied: AppliedOperation[];
  warnings: string[];
}

const MAX_COMPONENTS_PER_PAGE = 12;

export function cloneDocument(document: InterfaceDocument): InterfaceDocument {
  return structuredClone(document);
}

function makeNodeId(existing: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = `cmp_${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    if (!existing.has(id)) return id;
  }
  return `cmp_${Date.now().toString(36)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requirePage(
  document: InterfaceDocument,
  pageKey: string,
  context: EngineContext,
): PageSurface {
  if (!context.pageKeys.includes(pageKey)) {
    throw new InterfaceValidationError(`Unknown page "${pageKey}".`);
  }
  const page = document.pages[pageKey];
  if (!page) throw new InterfaceValidationError(`Page "${pageKey}" has no interface.`);
  return page;
}

function requireNode(page: PageSurface, id: string): InterfaceNode {
  const node = page.components.find((candidate) => candidate.id === id);
  if (!node) {
    throw new InterfaceValidationError(
      `No component "${id}" on this page. Available ids: ${page.components
        .map((component) => `${component.id} (${component.type})`)
        .join(", ")}.`,
    );
  }
  return node;
}

function coerceDataSource(
  node: InterfaceNode,
  requested: string | null | undefined,
  warnings: string[],
): DataSourceKey | null {
  const allowed = CATALOG[node.type].allowedDataSources;
  if (requested == null) {
    node.dataSource = CATALOG[node.type].defaultDataSource;
    return node.dataSource;
  }
  if ((allowed as string[]).includes(requested)) {
    node.dataSource = requested as DataSourceKey;
    return node.dataSource;
  }
  warnings.push(
    `${CATALOG[node.type].label} cannot bind to "${requested}"; using ${CATALOG[node.type].defaultDataSource ?? "no source"}.`,
  );
  node.dataSource = CATALOG[node.type].defaultDataSource;
  return node.dataSource;
}

/**
 * Places nodes on a 12 column grid without overlap. The requested column is
 * honoured when the slot is free, otherwise the node is packed into the next
 * free run, so a model can never produce an overlapping or overflowing layout.
 */
export function packLayouts(page: PageSurface): void {
  if (page.layout === "stack") {
    page.components.forEach((node, index) => {
      node.layout = { column: 1, span: 12 };
      void index;
    });
    return;
  }

  const rows: number[][] = [];
  const rowHasSpace = (row: number[], start: number, span: number): boolean => {
    for (let i = start; i < start + span; i += 1) if (row[i]) return false;
    return true;
  };

  for (const node of page.components) {
    const span = clamp(node.layout.span || 12, 1, 12);
    const preferred = clamp(node.layout.column || 1, 1, 13 - span);
    let placed = false;

    for (let r = 0; r < rows.length && !placed; r += 1) {
      const row = rows[r] as number[];
      if (rowHasSpace(row, preferred - 1, span)) {
        for (let i = preferred - 1; i < preferred - 1 + span; i += 1) row[i] = 1;
        node.layout = { column: preferred, span };
        placed = true;
      }
    }
    if (placed) continue;

    // Try to fit in the last row anywhere it is free.
    let lastIndex = rows.length - 1;
    if (lastIndex >= 0) {
      const row = rows[lastIndex] as number[];
      for (let start = 0; start + span <= 12; start += 1) {
        if (rowHasSpace(row, start, span)) {
          for (let i = start; i < start + span; i += 1) row[i] = 1;
          node.layout = { column: start + 1, span };
          placed = true;
          break;
        }
      }
    }
    if (placed) continue;

    // A fresh row: honour the requested column if it fits, otherwise start left.
    const start = 13 - span >= preferred ? preferred : 1;
    const fresh = new Array<number>(12).fill(0);
    for (let i = start - 1; i < start - 1 + span; i += 1) fresh[i] = 1;
    rows.push(fresh);
    node.layout = { column: start, span };
  }
}

/**
 * Repairs and re-validates a document. Used after AI operations, after visual
 * edits and when loading a stored revision (which migrates older schema versions).
 */
export function normalizeDocument(
  input: InterfaceDocument,
  context: EngineContext,
): { document: InterfaceDocument; warnings: string[] } {
  const warnings: string[] = [];
  const document = cloneDocument(input);

  if (!THEMES.includes(document.theme)) {
    document.theme = "light";
    warnings.push("Unknown theme reset to light.");
  }
  if (!ACCENTS.includes(document.accent)) {
    document.accent = "indigo";
    warnings.push("Unknown accent reset to indigo.");
  }
  if (!DENSITIES.includes(document.density)) {
    document.density = "comfortable";
    warnings.push("Unknown density reset to comfortable.");
  }
  document.nav = document.nav ?? { collapsed: false, width: "default" };
  document.nav.collapsed = Boolean(document.nav.collapsed);
  if (document.nav.width !== "compact" && document.nav.width !== "default") {
    document.nav.width = "default";
  }
  document.schemaVersion = 1;

  const orderedPages: Record<string, PageSurface> = {};
  for (const key of context.pageKeys) {
    const existing = document.pages[key];
    const page: PageSurface = existing
      ? {
          pageId: key,
          layout: PAGE_LAYOUTS.includes(existing.layout) ? existing.layout : "grid",
          components: Array.isArray(existing.components) ? existing.components : [],
        }
      : { pageId: key, layout: "grid", components: [] };

    if (!existing) warnings.push(`Page "${key}" was missing its interface; rebuilt.`);

    const seen = new Set<string>();
    const components: InterfaceNode[] = [];

    for (const node of page.components.slice(0, MAX_COMPONENTS_PER_PAGE)) {
      if (!isComponentType(node.type)) {
        warnings.push(`Dropped unknown component type "${String(node.type)}".`);
        continue;
      }
      const definition = CATALOG[node.type];
      const normalized = normalizeProps(node.type, (node.props ?? {}) as Record<string, unknown>);
      warnings.push(...normalized.warnings);

      let id = typeof node.id === "string" && node.id.length > 0 ? node.id : makeNodeId(seen);
      if (seen.has(id)) id = makeNodeId(seen);
      seen.add(id);

      const candidate: InterfaceNode = {
        id,
        type: node.type,
        title:
          typeof node.title === "string" && node.title.trim().length > 0
            ? node.title.trim().slice(0, 60)
            : definition.defaultTitle,
        visible: node.visible !== false,
        props: normalized.props,
        layout: {
          column: Number.isFinite(node.layout?.column) ? Number(node.layout.column) : 1,
          span: Number.isFinite(node.layout?.span) ? Number(node.layout.span) : definition.defaultSpan,
        },
        dataSource: CATALOG[node.type].defaultDataSource,
      };
      candidate.layout.span = clamp(candidate.layout.span, definition.minSpan, definition.maxSpan);
      coerceDataSource(candidate, node.dataSource ?? undefined, warnings);
      components.push(candidate);
    }

    if (components.length === 0) {
      const type: ComponentType = "TaskList";
      components.push({
        id: makeNodeId(seen),
        type,
        title: CATALOG[type].defaultTitle,
        visible: true,
        props: CATALOG[type].defaultProps,
        layout: { column: 1, span: CATALOG[type].defaultSpan },
        dataSource: "tasks",
      });
      warnings.push(`Page "${key}" had no components left; added a task list.`);
    }

    if (!components.some((component) => component.visible)) {
      components[0]!.visible = true;
      warnings.push(`Page "${key}" had every component hidden; the first one was shown.`);
    }

    page.components = components;
    packLayouts(page);

    for (const component of components) {
      if (component.visible === false) continue;
      if (component.layout.span < 1) component.layout.span = 12;
    }

    orderedPages[key] = page;
  }

  for (const key of Object.keys(document.pages)) {
    if (!context.pageKeys.includes(key)) {
      warnings.push(`Removed interface for deleted page "${key}".`);
    }
  }

  document.pages = orderedPages;
  if (!document.homePage || !context.pageKeys.includes(document.homePage)) {
    document.homePage = context.pageKeys[0] ?? "overview";
  }

  return { document, warnings: dedupe(warnings) };
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function describeOperation(operation: InterfaceOperation): {
  page?: string;
  target?: string;
  description: string;
} {
  switch (operation.op) {
    case "addComponent":
      return {
        page: operation.page,
        description: `Added ${CATALOG[operation.type].label} to ${operation.page}`,
      };
    case "removeComponent":
      return {
        page: operation.page,
        target: operation.id,
        description: `Removed a component from ${operation.page}`,
      };
    case "updateProps":
      return {
        page: operation.page,
        target: operation.id,
        description: `Changed ${Object.keys(operation.props).join(", ")}`,
      };
    case "moveComponent":
      return {
        page: operation.page,
        target: operation.id,
        description: `Moved a component on ${operation.page}`,
      };
    case "setVisible":
      return {
        page: operation.page,
        target: operation.id,
        description: `${operation.visible ? "Showed" : "Hid"} a component on ${operation.page}`,
      };
    case "renameComponent":
      return {
        page: operation.page,
        target: operation.id,
        description: `Renamed a component to "${operation.title}"`,
      };
    case "reorderComponents":
      return { page: operation.page, description: `Reordered ${operation.page}` };
    case "setTheme":
      return { description: `Switched to ${operation.theme} theme` };
    case "setAccent":
      return { description: `Set accent colour to ${operation.accent}` };
    case "setDensity":
      return { description: `Set ${operation.density} density` };
    case "setNavCollapsed":
      return { description: operation.collapsed ? "Collapsed navigation" : "Expanded navigation" };
    case "setNavWidth":
      return { description: `Set navigation width to ${operation.width}` };
    case "setPageLayout":
      return {
        page: operation.page,
        description: `Set ${operation.page} layout to ${operation.layout}`,
      };
    case "setDataSource":
      return {
        page: operation.page,
        target: operation.id,
        description: `Bound a component to ${operation.dataSource ?? "no source"}`,
      };
    default:
      return { description: "Updated the interface" };
  }
}

/**
 * Applies validated operations to a copy of the document. Any operation that
 * cannot be satisfied aborts the whole proposal: a partially applied AI change
 * is worse than a clear failure, because it leaves the user guessing.
 */
export function applyOperations(
  input: InterfaceDocument,
  operations: InterfaceOperation[],
  context: EngineContext,
): ApplyResult {
  const document = cloneDocument(input);
  const warnings: string[] = [];
  const applied: AppliedOperation[] = [];

  if (operations.length === 0) {
    throw new InterfaceValidationError("No operations were proposed.");
  }
  if (operations.length > 8) {
    throw new InterfaceValidationError("Too many operations in one request (max 8).");
  }

  const pageKeys = new Set<string>();
  for (const page of Object.values(document.pages)) {
    for (const node of page.components) pageKeys.add(node.id);
  }

  operations.forEach((operation, index) => {
    const step = index + 1;
    try {
      switch (operation.op) {
        case "addComponent": {
          const page = requirePage(document, operation.page, context);
          if (page.components.length >= MAX_COMPONENTS_PER_PAGE) {
            throw new InterfaceValidationError(
              `This page already has ${MAX_COMPONENTS_PER_PAGE} components; remove one first.`,
            );
          }
          const definition = CATALOG[operation.type];
          const normalized = normalizeProps(operation.type, operation.props ?? {});
          warnings.push(...normalized.warnings);

          const node: InterfaceNode = {
            id: makeNodeId(pageKeys),
            type: operation.type,
            title: (operation.title ?? definition.defaultTitle).trim().slice(0, 60),
            visible: true,
            props: normalized.props,
            layout: {
              column: operation.column ?? 1,
              span: clamp(
                operation.span ?? definition.defaultSpan,
                definition.minSpan,
                definition.maxSpan,
              ),
            },
            dataSource: definition.defaultDataSource,
          };
          coerceDataSource(node, operation.dataSource, warnings);
          const index_ = operation.index ?? page.components.length;
          page.components.splice(clamp(index_, 0, page.components.length), 0, node);
          pageKeys.add(node.id);
          break;
        }
        case "removeComponent": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          if (page.components.length <= 1) {
            throw new InterfaceValidationError(
              "A page cannot be left empty. Hide the component instead, or add another first.",
            );
          }
          page.components = page.components.filter((candidate) => candidate.id !== node.id);
          pageKeys.delete(node.id);
          break;
        }
        case "updateProps": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          const merged = { ...node.props, ...operation.props };
          const normalized = normalizeProps(node.type, merged);
          node.props = normalized.props;
          warnings.push(...normalized.warnings);
          break;
        }
        case "moveComponent": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          const definition = CATALOG[node.type];
          if (operation.span != null) {
            node.layout.span = clamp(operation.span, definition.minSpan, definition.maxSpan);
          }
          if (operation.column != null) {
            node.layout.column = clamp(operation.column, 1, 13 - node.layout.span);
          }
          if (operation.index != null) {
            const from = page.components.findIndex((candidate) => candidate.id === node.id);
            const target = clamp(operation.index, 0, page.components.length - 1);
            page.components.splice(from, 1);
            page.components.splice(target, 0, node);
          }
          break;
        }
        case "setVisible": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          if (
            !operation.visible &&
            !page.components.some((candidate) => candidate.id !== node.id && candidate.visible)
          ) {
            throw new InterfaceValidationError("At least one component must stay visible.");
          }
          node.visible = operation.visible;
          break;
        }
        case "renameComponent": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          node.title = operation.title.trim().slice(0, 60) || CATALOG[node.type].defaultTitle;
          break;
        }
        case "reorderComponents": {
          const page = requirePage(document, operation.page, context);
          const byId = new Map(page.components.map((node) => [node.id, node]));
          const ordered: InterfaceNode[] = [];
          for (const id of operation.ids) {
            const node = byId.get(id);
            if (node) {
              ordered.push(node);
              byId.delete(id);
            }
          }
          if (ordered.length === 0) throw new InterfaceValidationError("No valid component ids.");
          page.components = [...ordered, ...byId.values()];
          break;
        }
        case "setTheme":
          document.theme = operation.theme;
          break;
        case "setAccent":
          document.accent = operation.accent;
          break;
        case "setDensity":
          document.density = operation.density;
          break;
        case "setNavCollapsed":
          document.nav.collapsed = operation.collapsed;
          break;
        case "setNavWidth":
          document.nav.width = operation.width;
          break;
        case "setPageLayout": {
          const page = requirePage(document, operation.page, context);
          page.layout = operation.layout;
          break;
        }
        case "setDataSource": {
          const page = requirePage(document, operation.page, context);
          const node = requireNode(page, operation.id);
          coerceDataSource(node, operation.dataSource, warnings);
          break;
        }
      }
      applied.push({
        op: operation.op,
        ...describeOperation(operation),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown failure.";
      throw new InterfaceValidationError(
        `Step ${step} (${operation.op}) could not be applied: ${reason}`,
        warnings,
      );
    }
  });

  const normalized = normalizeDocument(document, context);
  return {
    document: normalized.document,
    applied,
    warnings: dedupe([...warnings, ...normalized.warnings]),
  };
}

/** Compact, model-readable description of the current interface. */
export function describeDocument(document: InterfaceDocument): string {
  const lines: string[] = [];
  lines.push(
    `theme=${document.theme} accent=${document.accent} density=${document.density} navCollapsed=${document.nav.collapsed} navWidth=${document.nav.width} homePage=${document.homePage}`,
  );
  for (const [key, page] of Object.entries(document.pages)) {
    lines.push(`page "${key}" layout=${page.layout} components=${page.components.length}`);
    for (const node of page.components) {
      lines.push(
        `  - id=${node.id} type=${node.type} title="${node.title}" span=${node.layout.span} column=${node.layout.column} visible=${node.visible} data=${node.dataSource ?? "none"} props=${JSON.stringify(node.props)}`,
      );
    }
  }
  return lines.join("\n");
}

export function visibleNodes(page: PageSurface): InterfaceNode[] {
  return page.components.filter((node) => node.visible);
}

export function createEmptyDocument(
  pageKeys: string[],
  theme: InterfaceDocument["theme"] = "light",
): InterfaceDocument {
  const pages: Record<string, PageSurface> = {};
  for (const key of pageKeys) {
    const hasCalendar = key.includes("calendar");
    const type: ComponentType = hasCalendar ? "Calendar" : "TaskList";
    pages[key] = {
      pageId: key,
      layout: "grid",
      components: [
        {
          id: makeNodeId(new Set()),
          type,
          title: CATALOG[type].defaultTitle,
          visible: true,
          props: CATALOG[type].defaultProps,
          layout: { column: 1, span: CATALOG[type].defaultSpan },
          dataSource: CATALOG[type].defaultDataSource,
        },
      ],
    };
  }
  return {
    schemaVersion: 1,
    theme,
    accent: "indigo",
    density: "comfortable",
    nav: { collapsed: false, width: "default" },
    homePage: pageKeys[0] ?? "overview",
    pages,
  };
}

export const MAX_SPAN = 12;
export { MAX_COMPONENTS_PER_PAGE };
export const ALL_COMPONENT_TYPES = COMPONENT_TYPES;
