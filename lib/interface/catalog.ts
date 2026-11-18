import { z } from "zod";
import {
  COMPONENT_TYPES,
  type ComponentType,
  type DataSourceKey,
  type Props,
} from "./types";

const boolean = z.boolean();
const optionalString = z.string().max(80);

export const METRICS = [
  "total",
  "open",
  "inProgress",
  "done",
  "overdue",
  "completion",
] as const;
export type MetricKey = (typeof METRICS)[number];

/**
 * Every property carries an explicit default. This is what lets the engine accept
 * partial model output (or a partial visual edit) without guessing: `parse({})`
 * yields the full, valid default property set for a component.
 */
const propsSchemas: Record<ComponentType, z.ZodTypeAny> = {
  StatSummary: z.object({
    metrics: z
      .array(z.enum(METRICS))
      .min(1)
      .max(6)
      .default(["total", "open", "inProgress", "done", "completion"]),
    showLabels: boolean.default(true),
  }),
  TaskBoard: z.object({
    columns: z
      .array(z.enum(["todo", "in_progress", "done"]))
      .min(1)
      .max(3)
      .default(["todo", "in_progress", "done"]),
    showCompleted: boolean.default(true),
    compact: boolean.default(false),
  }),
  TaskList: z.object({
    showCompleted: boolean.default(true),
    limit: z.number().int().min(3).max(50).default(10),
    sort: z.enum(["due", "priority", "created"]).default("due"),
    showDueDate: boolean.default(true),
    showPriority: boolean.default(true),
  }),
  TaskTable: z.object({
    showCompleted: boolean.default(true),
    pageSize: z.number().int().min(3).max(50).default(10),
    dense: boolean.default(false),
  }),
  Calendar: z.object({
    monthOffset: z.number().int().min(-18).max(18).default(0),
    showCompleted: boolean.default(true),
  }),
  ProgressChart: z.object({
    metric: z
      .enum(["weekly-completions", "status-breakdown", "priority-breakdown"])
      .default("weekly-completions"),
    weeks: z.union([z.literal(4), z.literal(8), z.literal(12)]).default(8),
    variant: z.enum(["bar", "line"]).default("bar"),
  }),
  QuickCreateTask: z.object({
    defaultPriority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    defaultStatus: z.enum(["todo", "in_progress"]).default("todo"),
    buttonLabel: optionalString.default("Add task"),
  }),
  FilterBar: z.object({
    showSearch: boolean.default(true),
    showStatus: boolean.default(true),
    showPriority: boolean.default(true),
  }),
  NotesPanel: z.object({
    maxItems: z.number().int().min(1).max(20).default(4),
    allowAdd: boolean.default(true),
  }),
  ActivityFeed: z.object({
    limit: z.number().int().min(3).max(20).default(6),
  }),
};

export interface ComponentDefinition {
  type: ComponentType;
  label: string;
  description: string;
  category: "data" | "insight" | "input";
  defaultSpan: number;
  minSpan: number;
  maxSpan: number;
  defaultTitle: string;
  allowedDataSources: DataSourceKey[];
  defaultDataSource: DataSourceKey | null;
  a11y: string;
  propsSchema: z.ZodTypeAny;
  defaultProps: Props;
  summarizeProps: (props: Props) => string;
}

function parseOrDefaults(schema: z.ZodTypeAny): Props {
  const parsed = schema.safeParse({});
  return parsed.success ? (parsed.data as Props) : {};
}

const definitions: Array<
  Omit<ComponentDefinition, "defaultProps" | "propsSchema"> & {
    propsSchema: z.ZodTypeAny;
  }
> = [
  {
    type: "StatSummary",
    label: "Stat summary",
    description:
      "Row of KPI cards computed from the workspace tasks (total, open, in progress, done, overdue, completion rate).",
    category: "insight",
    defaultSpan: 12,
    minSpan: 4,
    maxSpan: 12,
    defaultTitle: "Overview",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Each statistic is rendered as a definition list item with an accessible label, so screen readers read both value and meaning.",
    propsSchema: propsSchemas.StatSummary,
    summarizeProps: (props) => {
      const metrics = Array.isArray(props.metrics) ? props.metrics : [];
      return `${metrics.length} metric${metrics.length === 1 ? "" : "s"}`;
    },
  },
  {
    type: "TaskBoard",
    label: "Task board",
    description:
      "Kanban board with to do / in progress / done columns. Cards open an editor and can move between columns.",
    category: "data",
    defaultSpan: 12,
    minSpan: 6,
    maxSpan: 12,
    defaultTitle: "Task board",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Columns are labelled lists; every card is a button that opens the task dialog with keyboard focus.",
    propsSchema: propsSchemas.TaskBoard,
    summarizeProps: (props) => {
      const columns = Array.isArray(props.columns) ? props.columns.length : 3;
      return `${columns} columns${props.showCompleted === false ? ", completed hidden" : ""}`;
    },
  },
  {
    type: "TaskList",
    label: "Task list",
    description:
      "Compact list of tasks with inline completion toggles, due dates and priority.",
    category: "data",
    defaultSpan: 6,
    minSpan: 3,
    maxSpan: 12,
    defaultTitle: "Tasks",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Each task row contains a checkbox with an explicit label and a button to open details; ordering is conveyed in text.",
    propsSchema: propsSchemas.TaskList,
    summarizeProps: (props) =>
      `sorted by ${String(props.sort ?? "due")}${props.showCompleted === false ? ", completed hidden" : ""}`,
  },
  {
    type: "TaskTable",
    label: "Task table",
    description:
      "Dense sortable table of tasks with status, priority, due date and owner columns.",
    category: "data",
    defaultSpan: 12,
    minSpan: 6,
    maxSpan: 12,
    defaultTitle: "All tasks",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Uses a real table with column headers, aria-sort on sortable headers and a caption for context.",
    propsSchema: propsSchemas.TaskTable,
    summarizeProps: (props) => `${String(props.pageSize ?? 12)} rows per page`,
  },
  {
    type: "Calendar",
    label: "Calendar",
    description:
      "Month calendar of tasks by due date. Days show scheduled work and clicking a task opens it.",
    category: "data",
    defaultSpan: 6,
    minSpan: 4,
    maxSpan: 12,
    defaultTitle: "Calendar",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Grid of day cells with full date labels, current day marked with aria-current, tasks listed as buttons.",
    propsSchema: propsSchemas.Calendar,
    summarizeProps: (props) =>
      props.monthOffset === 0
        ? "current month"
        : `month offset ${String(props.monthOffset)}`,
  },
  {
    type: "ProgressChart",
    label: "Progress chart",
    description:
      "Chart of weekly completions, status breakdown or priority mix, drawn as inline SVG.",
    category: "insight",
    defaultSpan: 6,
    minSpan: 3,
    maxSpan: 12,
    defaultTitle: "Progress",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "SVG chart carries role=img with a descriptive aria-label plus a visually hidden data table of the same values.",
    propsSchema: propsSchemas.ProgressChart,
    summarizeProps: (props) => `${String(props.metric ?? "weekly-completions")}, ${String(props.weeks ?? 8)} weeks`,
  },
  {
    type: "QuickCreateTask",
    label: "Quick add",
    description:
      "Inline form to create a task with title, priority and due date.",
    category: "input",
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 12,
    defaultTitle: "Quick add",
    allowedDataSources: ["tasks"],
    defaultDataSource: "tasks",
    a11y:
      "Labelled form controls, Enter submits, validation errors announced with aria-live.",
    propsSchema: propsSchemas.QuickCreateTask,
    summarizeProps: (props) => `default priority ${String(props.defaultPriority ?? "medium")}`,
  },
  {
    type: "FilterBar",
    label: "Search & filters",
    description:
      "Search and status/priority filters that narrow every task component on the page.",
    category: "input",
    defaultSpan: 12,
    minSpan: 4,
    maxSpan: 12,
    defaultTitle: "",
    allowedDataSources: ["tasks"],
    defaultDataSource: null,
    a11y:
      "Search input has a label, filters are native selects, and the result count is announced politely.",
    propsSchema: propsSchemas.FilterBar,
    summarizeProps: (props) =>
      [
        props.showSearch !== false ? "search" : null,
        props.showStatus !== false ? "status" : null,
        props.showPriority !== false ? "priority" : null,
      ]
        .filter(Boolean)
        .join(" + ") || "no filters",
  },
  {
    type: "NotesPanel",
    label: "Notes",
    description:
      "Shared workspace notes with inline creation, persisted per application.",
    category: "data",
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 12,
    defaultTitle: "Notes",
    allowedDataSources: ["notes"],
    defaultDataSource: "notes",
    a11y: "Notes are a labelled list; the composer is a labelled textarea with a submit button.",
    propsSchema: propsSchemas.NotesPanel,
    summarizeProps: (props) => `up to ${String(props.maxItems ?? 6)} notes`,
  },
  {
    type: "ActivityFeed",
    label: "Activity",
    description: "Chronological feed of recent task activity in the workspace.",
    category: "insight",
    defaultSpan: 4,
    minSpan: 3,
    maxSpan: 12,
    defaultTitle: "Activity",
    allowedDataSources: ["activity"],
    defaultDataSource: "activity",
    a11y: "Ordered list with time elements and descriptive action text.",
    propsSchema: propsSchemas.ActivityFeed,
    summarizeProps: (props) => `last ${String(props.limit ?? 6)} updates`,
  },
];

export const CATALOG: Record<ComponentType, ComponentDefinition> = Object.fromEntries(
  definitions.map((definition) => [
    definition.type,
    {
      ...definition,
      defaultProps: parseOrDefaults(definition.propsSchema),
    } satisfies ComponentDefinition,
  ]),
) as Record<ComponentType, ComponentDefinition>;

export const CATALOG_LIST: ComponentDefinition[] = COMPONENT_TYPES.map(
  (type) => CATALOG[type],
);

export interface NormalizedProps {
  props: Props;
  warnings: string[];
}

/**
 * Coerces arbitrary model output into the component's approved property set:
 * unknown keys are dropped, invalid shapes fall back to defaults. A drop is
 * reported as a warning instead of silently changing meaning.
 */
export function normalizeProps(type: ComponentType, raw: Props): NormalizedProps {
  const definition = CATALOG[type];
  const warnings: string[] = [];

  const shape = (
    definition.propsSchema as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>
  ).shape;
  const allowed = new Set(Object.keys(shape ?? {}));
  const cleaned: Props = {};

  for (const [key, value] of Object.entries(raw ?? {})) {
    if (allowed.has(key)) cleaned[key] = value;
    else warnings.push(`Ignored unsupported prop "${key}" on ${definition.label}.`);
  }

  // Fill missing keys from the schema defaults so partial model output works.
  const defaults = definition.defaultProps as Props;
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in cleaned)) cleaned[key] = value;
  }

  const parsed = definition.propsSchema.safeParse(cleaned);
  if (parsed.success) {
    return { props: parsed.data as Props, warnings };
  }

  // Field-level recovery: keep the valid fields, default the rest.
  const recovered: Props = { ...defaults };
  for (const key of Object.keys(cleaned)) {
    const single = definition.propsSchema.safeParse({ ...recovered, [key]: cleaned[key] });
    if (single.success) Object.assign(recovered, single.data as Props);
    else warnings.push(`Used the default for "${key}" on ${definition.label}.`);
  }
  return { props: recovered, warnings };
}

export function defaultNodeTitle(type: ComponentType): string {
  return CATALOG[type].defaultTitle;
}

export function isComponentType(value: unknown): value is ComponentType {
  return (
    typeof value === "string" && (COMPONENT_TYPES as readonly string[]).includes(value)
  );
}
