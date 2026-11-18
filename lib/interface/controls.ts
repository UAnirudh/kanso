import type { ComponentType } from "./types";

/**
 * Declarative metadata for the visual settings editor. Keeping this next to the
 * props schemas means a new property cannot ship without an editor affordance
 * (or an explicit decision that it is AI-only).
 */
export type PropControl =
  | { key: string; label: string; type: "boolean"; help?: string }
  | { key: string; label: string; type: "number"; min: number; max: number; help?: string }
  | {
      key: string;
      label: string;
      type: "enum";
      options: Array<{ value: string; label: string }>;
      help?: string;
    }
  | {
      key: string;
      label: string;
      type: "multi";
      options: Array<{ value: string; label: string }>;
      help?: string;
    }
  | { key: string; label: string; type: "text"; maxLength: number; help?: string };

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

export const PROP_CONTROLS: Record<ComponentType, PropControl[]> = {
  StatSummary: [
    {
      key: "metrics",
      label: "Metrics shown",
      type: "multi",
      options: [
        { value: "total", label: "Total" },
        { value: "open", label: "To do" },
        { value: "inProgress", label: "In progress" },
        { value: "done", label: "Done" },
        { value: "overdue", label: "Overdue" },
        { value: "completion", label: "Completion %" },
      ],
    },
    { key: "showLabels", label: "Show labels", type: "boolean" },
  ],
  TaskBoard: [
    { key: "columns", label: "Columns", type: "multi", options: STATUS_OPTIONS },
    { key: "showCompleted", label: "Show completed tasks", type: "boolean" },
    { key: "compact", label: "Compact cards", type: "boolean" },
  ],
  TaskList: [
    { key: "showCompleted", label: "Show completed tasks", type: "boolean" },
    { key: "limit", label: "Maximum rows", type: "number", min: 3, max: 50 },
    {
      key: "sort",
      label: "Sort by",
      type: "enum",
      options: [
        { value: "due", label: "Due date" },
        { value: "priority", label: "Priority" },
        { value: "created", label: "Newest" },
      ],
    },
    { key: "showDueDate", label: "Show due dates", type: "boolean" },
    { key: "showPriority", label: "Show priority", type: "boolean" },
  ],
  TaskTable: [
    { key: "showCompleted", label: "Show completed tasks", type: "boolean" },
    { key: "pageSize", label: "Rows per page", type: "number", min: 3, max: 50 },
    { key: "dense", label: "Dense rows", type: "boolean" },
  ],
  Calendar: [
    { key: "monthOffset", label: "Month offset", type: "number", min: -12, max: 12 },
    { key: "showCompleted", label: "Show completed tasks", type: "boolean" },
  ],
  ProgressChart: [
    {
      key: "metric",
      label: "Metric",
      type: "enum",
      options: [
        { value: "weekly-completions", label: "Weekly completions" },
        { value: "status-breakdown", label: "Status breakdown" },
        { value: "priority-breakdown", label: "Priority breakdown" },
      ],
    },
    {
      key: "weeks",
      label: "Weeks",
      type: "enum",
      options: [
        { value: "4", label: "4" },
        { value: "8", label: "8" },
        { value: "12", label: "12" },
      ],
    },
    {
      key: "variant",
      label: "Style",
      type: "enum",
      options: [
        { value: "bar", label: "Bars" },
        { value: "line", label: "Line" },
      ],
    },
  ],
  QuickCreateTask: [
    {
      key: "defaultPriority",
      label: "Default priority",
      type: "enum",
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
        { value: "urgent", label: "Urgent" },
      ],
    },
    {
      key: "defaultStatus",
      label: "Default status",
      type: "enum",
      options: [
        { value: "todo", label: "To do" },
        { value: "in_progress", label: "In progress" },
      ],
    },
    { key: "buttonLabel", label: "Button label", type: "text", maxLength: 40 },
  ],
  FilterBar: [
    { key: "showSearch", label: "Search field", type: "boolean" },
    { key: "showStatus", label: "Status filter", type: "boolean" },
    { key: "showPriority", label: "Priority filter", type: "boolean" },
  ],
  NotesPanel: [
    { key: "maxItems", label: "Visible notes", type: "number", min: 1, max: 20 },
    { key: "allowAdd", label: "Allow new notes", type: "boolean" },
  ],
  ActivityFeed: [{ key: "limit", label: "Entries", type: "number", min: 3, max: 20 }],
};

/** Coerces a form value into the type the component schema expects. */
export function coerceControlValue(
  control: PropControl,
  raw: string | boolean | string[],
): unknown {
  if (control.type === "boolean") return Boolean(raw);
  if (control.type === "number") return Number(raw);
  if (control.type === "enum") {
    if (control.key === "weeks") return Number(raw);
    return String(raw);
  }
  return raw;
}
