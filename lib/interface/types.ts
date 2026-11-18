/**
 * The interface document is the unit of personalization.
 *
 * It is intentionally a data structure, not code: the AI can only propose
 * constrained operations against it, the server validates the result, and the
 * renderer maps approved component types to React components. No model-authored
 * JavaScript is ever evaluated.
 */

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const ACCENTS = ["indigo", "teal", "amber", "rose", "slate"] as const;
export type Accent = (typeof ACCENTS)[number];

export const DENSITIES = ["comfortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export const PAGE_LAYOUTS = ["grid", "stack"] as const;
export type PageLayout = (typeof PAGE_LAYOUTS)[number];

export const DATA_SOURCES = ["tasks", "notes", "activity"] as const;
export type DataSourceKey = (typeof DATA_SOURCES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const COMPONENT_TYPES = [
  "StatSummary",
  "TaskBoard",
  "TaskList",
  "TaskTable",
  "Calendar",
  "ProgressChart",
  "QuickCreateTask",
  "FilterBar",
  "NotesPanel",
  "ActivityFeed",
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export type Props = Record<string, unknown>;

export interface NodeLayout {
  /** 1-based start column on the 12 column grid. */
  column: number;
  /** How many columns the component spans. */
  span: number;
}

export interface InterfaceNode {
  id: string;
  type: ComponentType;
  title: string;
  visible: boolean;
  props: Props;
  layout: NodeLayout;
  dataSource: DataSourceKey | null;
}

export interface PageSurface {
  pageId: string;
  layout: PageLayout;
  components: InterfaceNode[];
}

export interface InterfaceDocument {
  schemaVersion: 1;
  theme: Theme;
  accent: Accent;
  density: Density;
  nav: {
    collapsed: boolean;
    width: "compact" | "default";
  };
  homePage: string;
  pages: Record<string, PageSurface>;
}

export interface AppPage {
  id: string;
  key: string;
  title: string;
  icon: string;
  sort: number;
}

export interface AppRecord {
  id: string;
  appId: string;
  kind: "task" | "note";
  title: string;
  description: string;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  dueDate: string | null;
  position: number;
  assigneeId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
