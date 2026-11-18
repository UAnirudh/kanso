"use client";

import { createContext, useContext } from "react";
import type { ActivityItem } from "@/lib/repo/records";
import type { AppRecord, TaskPriority, TaskStatus } from "@/lib/interface/types";

export interface SurfaceFilters {
  search: string;
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
}

export const EMPTY_FILTERS: SurfaceFilters = {
  search: "",
  status: "all",
  priority: "all",
};

export function filterTasks(tasks: AppRecord[], filters: SurfaceFilters): AppRecord[] {
  const search = filters.search.trim().toLowerCase();
  return tasks.filter((task) => {
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (search) {
      const haystack = `${task.title} ${task.description}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export interface SurfaceApi {
  /** Tasks after the page's search/filter bar has been applied. */
  tasks: AppRecord[];
  allTasks: AppRecord[];
  notes: AppRecord[];
  activity: ActivityItem[];
  filters: SurfaceFilters;
  setFilters: (patch: Partial<SurfaceFilters>) => void;
  canEdit: boolean;
  busy: boolean;
  openTask: (task: AppRecord) => void;
  toggleTask: (task: AppRecord) => void;
  createTask: (input: {
    title: string;
    priority: TaskPriority;
    dueDate: string | null;
    status?: TaskStatus;
  }) => Promise<boolean>;
  createNote: (text: string) => Promise<boolean>;
  updateNodeProps: (nodeId: string, props: Record<string, unknown>) => void;
}

export const SurfaceContext = createContext<SurfaceApi | null>(null);

export function useSurface(): SurfaceApi {
  const context = useContext(SurfaceContext);
  if (!context) throw new Error("Surface components must render inside a SurfaceContext.");
  return context;
}
