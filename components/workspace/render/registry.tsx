"use client";

import type { ReactNode } from "react";
import type { ComponentType, InterfaceNode } from "@/lib/interface/types";
import { CalendarView, TaskBoardView, TaskListView, TaskTableView } from "./task-views";
import { ActivityFeedView, ProgressChartView, StatSummaryView } from "./insight-views";
import { FilterBarView, NotesPanelView, QuickCreateTaskView } from "./input-views";

type ViewComponent = (props: { node: InterfaceNode }) => ReactNode;

/**
 * The only place a schema component type becomes a React component. Adding a
 * component without a catalogue entry (or vice versa) is a type error.
 */
export const REGISTRY: Record<ComponentType, ViewComponent> = {
  StatSummary: StatSummaryView,
  TaskBoard: TaskBoardView,
  TaskList: TaskListView,
  TaskTable: TaskTableView,
  Calendar: CalendarView,
  ProgressChart: ProgressChartView,
  QuickCreateTask: QuickCreateTaskView,
  FilterBar: FilterBarView,
  NotesPanel: NotesPanelView,
  ActivityFeed: ActivityFeedView,
};
