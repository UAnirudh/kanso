import type { AppRecord, TaskPriority, TaskStatus } from "./interface/types";
import { TASK_PRIORITIES, TASK_STATUSES } from "./interface/types";
import { parseDate, todayIso } from "./format";

export interface TaskStats {
  total: number;
  open: number;
  inProgress: number;
  done: number;
  overdue: number;
  completion: number;
}

export function isOverdue(task: AppRecord): boolean {
  if (task.kind !== "task" || task.status === "done" || !task.dueDate) return false;
  const due = parseDate(task.dueDate);
  const today = parseDate(todayIso());
  if (!due || !today) return false;
  return due.getTime() < today.getTime();
}

export function computeStats(tasks: AppRecord[]): TaskStats {
  const total = tasks.length;
  const open = tasks.filter((task) => task.status === "todo").length;
  const inProgress = tasks.filter((task) => task.status === "in_progress").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter(isOverdue).length;
  return {
    total,
    open,
    inProgress,
    done,
    overdue,
    completion: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export interface SeriesPoint {
  label: string;
  value: number;
  hint?: string;
}

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7; // Monday based
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function weeklyCompletions(tasks: AppRecord[], weeks: number): SeriesPoint[] {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const buckets: SeriesPoint[] = [];

  for (let index = 0; index < weeks; index += 1) {
    const weekStart = new Date(start);
    weekStart.setDate(start.getDate() + index * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const value = tasks.filter((task) => {
      if (!task.completedAt) return false;
      const completed = new Date(task.completedAt);
      return completed >= weekStart && completed < weekEnd;
    }).length;
    buckets.push({
      label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      value,
    });
  }
  return buckets;
}

export function statusBreakdown(tasks: AppRecord[]): SeriesPoint[] {
  return TASK_STATUSES.map((status) => ({
    label: status === "in_progress" ? "In progress" : status === "todo" ? "To do" : "Done",
    value: tasks.filter((task) => task.status === status).length,
    hint: status,
  }));
}

export function priorityBreakdown(tasks: AppRecord[]): SeriesPoint[] {
  return TASK_PRIORITIES.map((priority) => ({
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
    value: tasks.filter((task) => task.priority === priority).length,
    hint: priority,
  }));
}

export const METRIC_LABEL: Record<string, string> = {
  total: "Total tasks",
  open: "To do",
  inProgress: "In progress",
  done: "Done",
  overdue: "Overdue",
  completion: "Complete",
};

export const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "todo",
  in_progress: "progress",
  done: "done",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
