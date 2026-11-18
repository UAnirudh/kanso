import { CATALOG } from "./catalog";
import type { InterfaceOperation } from "./operations";
import type {
  Accent,
  ComponentType,
  Density,
  InterfaceDocument,
  PageSurface,
} from "./types";

interface NodeSeed {
  type: ComponentType;
  span?: number;
  column?: number;
  title?: string;
  props?: Record<string, unknown>;
}

interface PageSeed {
  key: string;
  title: string;
  icon: string;
  nodes: NodeSeed[];
}

export interface TemplateDefinition {
  id: "project" | "personal";
  name: string;
  description: string;
  pages: PageSeed[];
}

function buildPage(seed: PageSeed, idFactory: () => string): PageSurface {
  return {
    pageId: seed.key,
    layout: "grid",
    components: seed.nodes.map((node) => {
      const definition = CATALOG[node.type];
      return {
        id: idFactory(),
        type: node.type,
        title: node.title ?? definition.defaultTitle,
        visible: true,
        props: { ...definition.defaultProps, ...(node.props ?? {}) },
        layout: {
          column: node.column ?? 1,
          span: node.span ?? definition.defaultSpan,
        },
        dataSource: definition.defaultDataSource,
      };
    }),
  };
}

export function buildDocumentFromTemplate(
  template: TemplateDefinition,
  options: {
    idFactory: () => string;
    theme?: "light" | "dark";
    accent?: Accent;
    density?: Density;
    navCollapsed?: boolean;
  },
): InterfaceDocument {
  const pages: Record<string, PageSurface> = {};
  for (const seed of template.pages) {
    pages[seed.key] = buildPage(seed, options.idFactory);
  }
  return {
    schemaVersion: 1,
    theme: options.theme ?? "light",
    accent: options.accent ?? "indigo",
    density: options.density ?? "comfortable",
    nav: { collapsed: options.navCollapsed ?? false, width: "default" },
    homePage: template.pages[0]?.key ?? "overview",
    pages,
  };
}

export const PROJECT_TEMPLATE: TemplateDefinition = {
  id: "project",
  name: "Project workspace",
  description:
    "A shared project workspace: overview dashboard, kanban board, calendar and analytics. Tasks are real records with status, priority, due dates and owners.",
  pages: [
    {
      key: "overview",
      title: "Overview",
      icon: "layout-dashboard",
      nodes: [
        {
          type: "FilterBar",
          span: 12,
          props: { showSearch: true, showStatus: true, showPriority: true },
        },
        { type: "StatSummary", span: 12 },
        { type: "TaskBoard", span: 8, title: "Task board" },
        { type: "NotesPanel", span: 4, title: "Team notes" },
      ],
    },
    {
      key: "board",
      title: "Board",
      icon: "columns-3",
      nodes: [
        { type: "FilterBar", span: 12 },
        {
          type: "TaskBoard",
          span: 12,
          title: "Delivery board",
          props: { showCompleted: true, compact: false },
        },
      ],
    },
    {
      key: "calendar",
      title: "Calendar",
      icon: "calendar-days",
      nodes: [
        { type: "Calendar", span: 8, title: "Schedule" },
        { type: "QuickCreateTask", span: 4, title: "Schedule a task" },
      ],
    },
    {
      key: "analytics",
      title: "Analytics",
      icon: "chart-column",
      nodes: [
        { type: "StatSummary", span: 12, title: "Delivery health" },
        {
          type: "ProgressChart",
          span: 6,
          title: "Weekly completions",
          props: { metric: "weekly-completions", weeks: 8, variant: "bar" },
        },
        {
          type: "ProgressChart",
          span: 6,
          title: "Status mix",
          props: { metric: "status-breakdown", weeks: 8, variant: "bar" },
        },
        { type: "TaskTable", span: 12, title: "All tasks" },
      ],
    },
  ],
};

export const PERSONAL_TEMPLATE: TemplateDefinition = {
  id: "personal",
  name: "Personal tracker",
  description:
    "A lighter personal task tracker: today's list, calendar and a progress view.",
  pages: [
    {
      key: "today",
      title: "Today",
      icon: "sun",
      nodes: [
        { type: "StatSummary", span: 12, title: "Today" },
        { type: "TaskList", span: 7, title: "My tasks", props: { limit: 12, showCompleted: false } },
        { type: "QuickCreateTask", span: 5, title: "Add a task" },
        { type: "NotesPanel", span: 5, title: "Scratchpad", props: { maxItems: 4 } },
      ],
    },
    {
      key: "calendar",
      title: "Calendar",
      icon: "calendar-days",
      nodes: [
        { type: "Calendar", span: 8, title: "Calendar" },
        { type: "ActivityFeed", span: 4, title: "Recent" },
      ],
    },
    {
      key: "progress",
      title: "Progress",
      icon: "chart-column",
      nodes: [
        { type: "ProgressChart", span: 6, title: "Completed per week", props: { weeks: 12 } },
        { type: "ProgressChart", span: 6, title: "Priority mix", props: { metric: "priority-breakdown" } },
        { type: "TaskTable", span: 12, title: "Everything" },
      ],
    },
  ],
};

export const TEMPLATES: TemplateDefinition[] = [PROJECT_TEMPLATE, PERSONAL_TEMPLATE];

export function selectTemplate(prompt: string): TemplateDefinition {
  const text = prompt.toLowerCase();
  const personalSignals = ["personal", "habit", "journal", "solo", "my day", "daily"];
  const projectSignals = ["project", "team", "sprint", "delivery", "kanban", "workspace", "agency"];
  const personalScore = personalSignals.filter((signal) => text.includes(signal)).length;
  const projectScore = projectSignals.filter((signal) => text.includes(signal)).length;
  if (personalScore > projectScore) return PERSONAL_TEMPLATE;
  return PROJECT_TEMPLATE;
}

export function operationLabel(operation: InterfaceOperation): string {
  switch (operation.op) {
    case "addComponent":
      return `Add ${CATALOG[operation.type].label}`;
    case "setTheme":
      return `Theme → ${operation.theme}`;
    case "setAccent":
      return `Accent → ${operation.accent}`;
    case "setDensity":
      return `Density → ${operation.density}`;
    case "setNavCollapsed":
      return operation.collapsed ? "Collapse navigation" : "Expand navigation";
    case "setVisible":
      return operation.visible ? "Show component" : "Hide component";
    case "moveComponent":
      return "Move component";
    case "removeComponent":
      return "Remove component";
    case "updateProps":
      return "Update component settings";
    case "renameComponent":
      return `Rename → ${operation.title}`;
    case "reorderComponents":
      return "Reorder components";
    case "setPageLayout":
      return `Layout → ${operation.layout}`;
    case "setNavWidth":
      return `Navigation → ${operation.width}`;
    case "setDataSource":
      return `Bind → ${operation.dataSource ?? "none"}`;
    default:
      return "Update the interface";
  }
}
