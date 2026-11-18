import { CATALOG } from "../interface/catalog";
import type { InterfaceOperation } from "../interface/operations";
import type { ComponentType, InterfaceDocument } from "../interface/types";

/**
 * Deterministic planner used when no GROQ_API_KEY is configured.
 *
 * This is not a model and is never described as one: it applies a small, honest
 * rule set over the same operation vocabulary the model uses, so the rest of the
 * pipeline (validation, preview, apply, versioning) is exercised for real.
 */

export class LocalPlannerError extends Error {
  readonly hints: string[];

  constructor(message: string, hints: string[] = []) {
    super(message);
    this.name = "LocalPlannerError";
    this.hints = hints;
  }
}

export interface LocalPlan {
  summary: string;
  message: string;
  operations: InterfaceOperation[];
}

type Direction = "left" | "right" | "top" | "bottom";

const TYPE_KEYWORDS: Array<[RegExp, ComponentType]> = [
  [/progress chart|chart|graph|burn[- ]?down|velocity/, "ProgressChart"],
  [/stats?\b|metric|kpi|summary card|overview cards?/, "StatSummary"],
  [/calendar|schedule|upcoming/, "Calendar"],
  [/kanban|board/, "TaskBoard"],
  [/timeline|task list|to-?do list|task feed|list of tasks/, "TaskList"],
  [/table|spreadsheet|grid of tasks/, "TaskTable"],
  [/notes?|scratchpad|memo/, "NotesPanel"],
  [/activity|recent changes|feed/, "ActivityFeed"],
  [/quick add|new task|add task form/, "QuickCreateTask"],
  [/filters?|search bar|search and filter/, "FilterBar"],
];

const TASK_TYPES: ComponentType[] = ["TaskBoard", "TaskList", "TaskTable"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mentions(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function detectTypes(text: string): ComponentType[] {
  const found: ComponentType[] = [];
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(text) && !found.includes(type)) found.push(type);
  }
  return found;
}

const DIRECTION_WORDS: Array<[RegExp, Direction]> = [
  [/\bleft\b|left[- ]hand/, "left"],
  [/\bright\b|right[- ]hand/, "right"],
  [/\btop\b|\babove\b/, "top"],
  [/\bbottom\b|\bbelow\b/, "bottom"],
];

function directionFrom(fragment: string): Direction | null {
  for (const [pattern, direction] of DIRECTION_WORDS) {
    if (pattern.test(fragment)) return direction;
  }
  return null;
}

/**
 * Direction is resolved per clause, so "move tasks to the left, add a chart on
 * the right" does not apply the same edge to both components.
 */
function directionForType(text: string, type: ComponentType): Direction | null {
  const entry = TYPE_KEYWORDS.find(([, candidate]) => candidate === type);
  if (!entry) return null;
  const match = entry[0].exec(text);
  if (!match) return null;

  // Look at the words immediately after the component mention first, because
  // "move tasks to the left, add a chart on the right" mentions both edges.
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 40);
  const afterDirection = directionFrom(after);
  if (afterDirection) return afterDirection;

  const before = text.slice(Math.max(0, match.index - 30), match.index);
  return directionFrom(before);
}

function pageContaining(document: InterfaceDocument, type: ComponentType): string | null {
  for (const [pageKey, page] of Object.entries(document.pages)) {
    if (page.components.some((node) => node.type === type)) return pageKey;
  }
  return null;
}

function pageMentionedIn(
  document: InterfaceDocument,
  text: string,
  pageTitles: Record<string, string> | undefined,
): string | null {
  // A page only counts as named when the request says "… page/tab/view", so
  // "add a calendar" refers to the component, not the page called Calendar.
  for (const pageKey of Object.keys(document.pages)) {
    const title = (pageTitles?.[pageKey] ?? "").toLowerCase().trim();
    const keyWords = pageKey.replace(/-/g, " ");
    const candidates = [title, keyWords].filter(Boolean);
    for (const name of candidates) {
      const patterns = [
        `${name} page`,
        `${name} tab`,
        `${name} view`,
        `${name} section`,
        `on ${name}`,
      ];
      if (patterns.some((pattern) => text.includes(pattern))) return pageKey;
    }
  }
  return null;
}

function spanFor(
  type: ComponentType,
  desired: number,
): number {
  const definition = CATALOG[type];
  return clamp(desired, definition.minSpan, definition.maxSpan);
}

function positionFor(type: ComponentType, direction: Direction | null) {
  if (direction === "left") return { column: 1, span: spanFor(type, 8) };
  if (direction === "right") return { column: 9, span: spanFor(type, 4) };
  if (direction === "top") return { column: 1, span: 12 };
  if (direction === "bottom") return { column: 1, span: spanFor(type, 12) };
  return { column: 1, span: CATALOG[type].defaultSpan };
}

export function planLocally(input: {
  prompt: string;
  document: InterfaceDocument;
  pageTitles?: Record<string, string>;
}): LocalPlan {
  const raw = input.prompt.trim();
  const text = raw.toLowerCase();
  const document = input.document;
  const operations: InterfaceOperation[] = [];

  const globalDirection: Direction | null = directionFrom(text);
  const moveTaskClause = /(?:move|shift|put|place|send)[^.;,]{0,48}?(left|right|top|bottom)/.exec(text);
  const taskDirection = (moveTaskClause?.[1] as Direction | undefined) ?? globalDirection;

  const addIntent = mentions(text, /\b(add|include|create|show me|give me|need|want|put in)\b/);
  const moveIntent = mentions(text, /\b(move|shift|put|place|send)\b/);
  const hideIntent = mentions(text, /\b(hide|collapse)\b/);
  const removeIntent = mentions(text, /\b(remove|delete|drop|get rid of)\b/);

  // --- Global presentation -------------------------------------------------
  if (mentions(text, /\bdark\b/)) operations.push({ op: "setTheme", theme: "dark" });
  else if (mentions(text, /\blight\b|\bwhite\b/)) operations.push({ op: "setTheme", theme: "light" });

  if (mentions(text, /\bminimal|minimalist|cleaner|less clutter|simplif/)) {
    operations.push({ op: "setDensity", density: "compact" });
    operations.push({ op: "setNavCollapsed", collapsed: true });
  }
  if (mentions(text, /\bcompact|dense|tighter|more information\b/)) {
    operations.push({ op: "setDensity", density: "compact" });
  }
  if (mentions(text, /\bcomfortable|spacious|roomier|relaxed|airier\b/)) {
    operations.push({ op: "setDensity", density: "comfortable" });
  }

  const navMention = mentions(text, /\b(sidebar|navigation|nav|menu)\b/);
  if (navMention) {
    if (mentions(text, /\bsmaller|narrow|thin|slim|tight|compact\b/)) {
      operations.push({ op: "setNavWidth", width: "compact" });
    }
    if (mentions(text, /\bbigger|wider|expand|larger\b/)) {
      operations.push({ op: "setNavCollapsed", collapsed: false });
      operations.push({ op: "setNavWidth", width: "default" });
    }
    if (hideIntent || mentions(text, /\bcollapsed|collapse|icon only|icons?\b/)) {
      operations.push({ op: "setNavCollapsed", collapsed: true });
    }
  }

  if (mentions(text, /\bmobile|phone|tablet|small screen|responsive\b/)) {
    for (const pageKey of Object.keys(document.pages)) {
      operations.push({ op: "setPageLayout", page: pageKey, layout: "stack" });
    }
    operations.push({ op: "setDensity", density: "compact" });
    operations.push({ op: "setNavCollapsed", collapsed: true });
  }

  // Style references: restrained, no branding claims.
  if (mentions(text, /\blinear\b|\bvercel\b|\bnotion\b|\bfigma\b|\bstripe\b/)) {
    operations.push({ op: "setTheme", theme: "dark" });
    operations.push({ op: "setDensity", density: "compact" });
    operations.push({ op: "setNavCollapsed", collapsed: true });
  }

  if (mentions(text, /\bteal\b|\bgreen\b|\bemerald\b/)) operations.push({ op: "setAccent", accent: "teal" });
  else if (mentions(text, /\bamber\b|\borange\b|\bwarm\b/)) operations.push({ op: "setAccent", accent: "amber" });
  else if (mentions(text, /\brose\b|\bpink\b|\bred\b/)) operations.push({ op: "setAccent", accent: "rose" });
  else if (mentions(text, /\bslate\b|\bmonochrome\b|\bgrey|gray\b/)) operations.push({ op: "setAccent", accent: "slate" });
  else if (mentions(text, /\bpurple\b|\bindigo\b|\bviolet\b/)) operations.push({ op: "setAccent", accent: "indigo" });

  // --- Task prop changes ---------------------------------------------------
  if (mentions(text, /hide (all )?(the )?(completed|done|finished)/)) {
    for (const [pageKey, page] of Object.entries(document.pages)) {
      for (const node of page.components) {
        if (node.type === "TaskBoard" || node.type === "TaskList" || node.type === "TaskTable" || node.type === "Calendar") {
          operations.push({
            op: "updateProps",
            page: pageKey,
            id: node.id,
            props: { showCompleted: false },
          });
        }
      }
    }
  }
  if (mentions(text, /show (all )?(the )?(completed|done)/)) {
    for (const [pageKey, page] of Object.entries(document.pages)) {
      for (const node of page.components) {
        if (node.type === "TaskBoard" || node.type === "TaskList" || node.type === "TaskTable") {
          operations.push({ op: "updateProps", page: pageKey, id: node.id, props: { showCompleted: true } });
        }
      }
    }
  }

  const mentionedPage = pageMentionedIn(document, text, input.pageTitles);
  // New components land on the page the user named, else on their home page.
  // Existing components are found wherever they actually live.
  const addPage = mentionedPage ?? document.homePage;

  // --- Replace one component with another ---------------------------------
  const replaceMatch = /\breplace (?:the |my )?([a-z ]+?) with (?:a |an |the )?(?:more [a-z]+ )?([a-z ]+)/.exec(text);
  if (replaceMatch) {
    const [, fromText, toText] = replaceMatch;
    const fromTypes = detectTypes(fromText ?? "");
    const toTypes = detectTypes(toText ?? "");
    if (fromTypes[0] && toTypes[0]) {
      const fromType = fromTypes[0];
      const toType = toTypes[0];
      for (const [pageKey, page] of Object.entries(document.pages)) {
        const node = page.components.find((candidate) => candidate.type === fromType);
        if (node) {
          operations.push({ op: "removeComponent", page: pageKey, id: node.id });
          operations.push({ op: "addComponent", page: pageKey, type: toType, span: CATALOG[toType].defaultSpan });
          break;
        }
      }
    }
  }

  const replacedTypes = /replace/.test(text) ? detectTypes(text) : [];
  const targetTypes = detectTypes(text).filter((type) => !replacedTypes.includes(type));

  for (const type of targetTypes) {
    const existingPage = pageContaining(document, type);
    const nodePage = existingPage ?? addPage;
    const nodeToMove =
      document.pages[nodePage]?.components.find((node) => node.type === type) ?? null;
    const direction = directionForType(text, type) ?? globalDirection;

    if (hideIntent && !addIntent) {
      if (nodePage && nodeToMove) {
        operations.push({ op: "setVisible", page: nodePage, id: nodeToMove.id, visible: false });
      }
      continue;
    }

    if (removeIntent && !addIntent) {
      if (nodePage && nodeToMove) {
        operations.push({ op: "removeComponent", page: nodePage, id: nodeToMove.id });
      }
      continue;
    }

    if (nodePage && nodeToMove && direction && moveIntent && !addIntent) {
      const { column, span } = positionFor(type, direction);
      operations.push({
        op: "moveComponent",
        page: nodePage,
        id: nodeToMove.id,
        column,
        span,
        ...(direction === "top" ? { index: 0 } : {}),
      });
      continue;
    }

    if (addIntent || (!nodeToMove && direction && moveIntent)) {
      const { column, span } = positionFor(type, direction);
      const taskNode = document.pages[addPage]?.components.find((node) =>
        TASK_TYPES.includes(node.type),
      );
      const insertIndex =
        direction === "right" && taskNode
          ? document.pages[addPage]!.components.indexOf(taskNode) + 1
          : undefined;
      operations.push({
        op: "addComponent",
        page: addPage,
        type,
        span,
        column,
        ...(insertIndex !== undefined ? { index: insertIndex } : {}),
      });
      continue;
    }

    if (mentions(text, /\bbigger|larger|full width|wider\b/) && nodePage && nodeToMove) {
      operations.push({
        op: "moveComponent",
        page: nodePage,
        id: nodeToMove.id,
        span: 12,
        column: 1,
      });
      continue;
    }
    if (mentions(text, /\bsmaller|narrower|compact\b/) && nodePage && nodeToMove) {
      operations.push({
        op: "moveComponent",
        page: nodePage,
        id: nodeToMove.id,
        span: spanFor(type, 4),
      });
      continue;
    }
  }

  // "Move my tasks" without naming a task component type.
  const namedTaskComponent = targetTypes.some((type) => TASK_TYPES.includes(type));
  if (taskDirection && moveIntent && !namedTaskComponent) {
    for (const type of TASK_TYPES) {
      const pageKey = pageContaining(document, type);
      if (!pageKey) continue;
      const node = document.pages[pageKey]!.components.find((candidate) => candidate.type === type);
      if (!node) continue;
      const { column, span } = positionFor(type, taskDirection);
      operations.push({
        op: "moveComponent",
        page: pageKey,
        id: node.id,
        column,
        span,
        ...(taskDirection === "top" ? { index: 0 } : {}),
      });
      break;
    }
  }

  // Closing the loop on "hide everything I rarely use".
  if (mentions(text, /rarely use|never use|not using|unused/)) {
    for (const [pageKey, page] of Object.entries(document.pages)) {
      const hidden = page.components.filter(
        (node) => node.type === "ActivityFeed" || node.type === "NotesPanel",
      );
      for (const node of hidden) {
        operations.push({ op: "setVisible", page: pageKey, id: node.id, visible: false });
      }
    }
  }

  const deduped: InterfaceOperation[] = [];
  const seen = new Set<string>();
  for (const operation of operations) {
    const key = JSON.stringify(operation);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(operation);
  }

  if (deduped.length === 0) {
    throw new LocalPlannerError(
      "I could not map that request to a supported interface change. Nothing has been modified.",
      [
        "Move the task board to the left and add a progress chart on the right",
        "Switch to dark mode and hide completed tasks",
        "Collapse the navigation and use compact density",
        "Add a calendar to the on-page canvas",
      ],
    );
  }

  const summaryParts = deduped.slice(0, 4).map((operation) => describeForSummary(operation));
  const summary = capitalize(summaryParts.join(", ")).slice(0, 110);

  return {
    summary,
    message:
      "Generated by the built-in rule planner because no GROQ_API_KEY is configured. Preview it, then apply — nothing has changed yet.",
    operations: deduped.slice(0, 8),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeForSummary(operation: InterfaceOperation): string {
  switch (operation.op) {
    case "addComponent":
      return `add ${CATALOG[operation.type].label.toLowerCase()}`;
    case "removeComponent":
      return "remove a component";
    case "moveComponent":
      return (operation.column ?? 1) === 1
        ? "move a component left"
        : (operation.column ?? 1) >= 9
          ? "move a component right"
          : "reposition a component";
    case "setTheme":
      return `${operation.theme} theme`;
    case "setAccent":
      return `${operation.accent} accent`;
    case "setDensity":
      return `${operation.density} density`;
    case "setNavCollapsed":
      return operation.collapsed ? "collapse navigation" : "expand navigation";
    case "setNavWidth":
      return `${operation.width} navigation`;
    case "setVisible":
      return operation.visible ? "show a component" : "hide a component";
    case "updateProps":
      return Object.keys(operation.props).map((key) => `${key}=${String(operation.props[key])}`).join(" ");
    case "renameComponent":
      return `rename to “${operation.title}”`;
    case "reorderComponents":
      return "reorder components";
    case "setPageLayout":
      return `${operation.layout} layout`;
    case "setDataSource":
      return `bind to ${operation.dataSource ?? "nothing"}`;
    default:
      return "update the interface";
  }
}
