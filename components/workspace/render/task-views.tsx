"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus } from "lucide-react";
import {
  STATUS_LABEL,
  type AppRecord,
  type InterfaceNode,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/interface/types";
import { dueMeta, formatDateLong, formatMonth, parseDate, todayIso } from "@/lib/format";
import { PRIORITY_LABEL } from "@/lib/interface/types";
import { PRIORITY_ORDER } from "@/lib/analytics";
import { useSurface } from "./context";
import { EmptyHint, SurfaceCard } from "./SurfaceCard";

function priorityPill(priority: TaskPriority | null) {
  if (!priority) return null;
  return <span className={`pill pill-${priority}`}>{PRIORITY_LABEL[priority]}</span>;
}

function duePill(task: AppRecord) {
  const due = dueMeta(task.dueDate);
  if (due.tone === "none") return null;
  const tone = due.tone === "overdue" ? "pill-urgent" : "pill-low";
  return <span className={`pill ${tone}`}>{due.label}</span>;
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "todo") return "in_progress";
  if (status === "in_progress") return "done";
  return "done";
}

export function TaskBoardView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const columns = Array.isArray(node.props.columns)
    ? (node.props.columns as TaskStatus[])
    : (["todo", "in_progress", "done"] as TaskStatus[]);
  const showCompleted = node.props.showCompleted !== false;
  const compact = node.props.compact === true;

  const tasks = api.tasks.filter((task) => showCompleted || task.status !== "done");

  return (
    <SurfaceCard
      title={node.title}
      badge={
        <span className="pill pill-low" aria-label={`${tasks.length} tasks`}>
          {tasks.length}
        </span>
      }
      flush
    >
      <div className="p-3">
        {tasks.length === 0 ? (
          <EmptyHint>No tasks match this view yet.</EmptyHint>
        ) : (
          <div className="kanban" style={{ ["--cols" as string]: String(columns.length) }}>
            {columns.map((status) => {
              const columnTasks = tasks
                .filter((task) => task.status === status)
                .sort(
                  (a, b) =>
                    (PRIORITY_ORDER[(a.priority ?? "medium") as TaskPriority] ?? 2) -
                    (PRIORITY_ORDER[(b.priority ?? "medium") as TaskPriority] ?? 2),
                );
              return (
                <div key={status} className="kanban-col" role="list" aria-label={STATUS_LABEL[status]}>
                  <div className="kanban-col-head">
                    <span>{STATUS_LABEL[status]}</span>
                    <span aria-hidden>{columnTasks.length}</span>
                  </div>
                  {columnTasks.length === 0 && (
                    <p className="px-1 py-2 text-[11px] text-[var(--s-faint)]">Nothing here</p>
                  )}
                  {columnTasks.map((task) => (
                    <div
                      key={task.id}
                      role="listitem"
                      className="task-card"
                      data-done={task.status === "done"}
                    >
                      <button
                        type="button"
                        onClick={() => api.openTask(task)}
                        className="block w-full text-left"
                        aria-label={`Open ${task.title}`}
                      >
                        <span className="task-title block">{task.title}</span>
                        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {priorityPill(task.priority)}
                          {duePill(task)}
                        </span>
                      </button>
                      {api.canEdit && task.status !== "done" && (
                        <button
                          type="button"
                          className="s-btn s-btn-ghost mt-1 -ml-1.5 h-5 text-[10px]"
                          onClick={() => api.toggleTask(task)}
                          aria-label={`Mark ${task.title} done`}
                        >
                          Mark done
                        </button>
                      )}
                    </div>
                  ))}
                  {compact && columnTasks.length === 0 && <span className="sr-only">Empty</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SurfaceCard>
  );
}

export function TaskListView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const showCompleted = node.props.showCompleted !== false;
  const limit = typeof node.props.limit === "number" ? node.props.limit : 10;
  const sort = String(node.props.sort ?? "due");
  const showDueDate = node.props.showDueDate !== false;
  const showPriority = node.props.showPriority !== false;

  const rows = useMemo(() => {
    const list = api.tasks.filter((task) => showCompleted || task.status !== "done");
    const sorted = [...list].sort((a, b) => {
      if (sort === "priority") {
        return (
          (PRIORITY_ORDER[(a.priority ?? "medium") as TaskPriority] ?? 2) -
          (PRIORITY_ORDER[(b.priority ?? "medium") as TaskPriority] ?? 2)
        );
      }
      if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
      if (!a.dueDate && !b.dueDate) return a.title.localeCompare(b.title);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    return sorted.slice(0, limit);
  }, [api.tasks, showCompleted, limit, sort]);

  return (
    <SurfaceCard title={node.title} badge={<span className="pill pill-low">{rows.length}</span>}>
      {rows.length === 0 ? (
        <EmptyHint>Nothing open. Add a task and it appears here.</EmptyHint>
      ) : (
        <ul className="divide-y divide-[var(--s-border)]" role="list">
          {rows.map((task) => {
            const due = dueMeta(task.dueDate);
            return (
              <li key={task.id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <input
                  type="checkbox"
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--s-accent)]"
                  checked={task.status === "done"}
                  disabled={!api.canEdit || api.busy}
                  onChange={() => api.toggleTask(task)}
                  aria-label={`Mark ${task.title} complete`}
                />
                <button
                  type="button"
                  onClick={() => api.openTask(task)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={`block truncate text-[12.5px] ${
                      task.status === "done"
                        ? "text-[var(--s-faint)] line-through"
                        : "text-[var(--s-text)]"
                    }`}
                  >
                    {task.title}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {showPriority && priorityPill(task.priority)}
                    {showDueDate && due.tone !== "none" && (
                      <span
                        className={`text-[10.5px] ${
                          due.tone === "overdue" ? "font-medium text-red-500" : "text-[var(--s-faint)]"
                        }`}
                      >
                        {due.label}
                      </span>
                    )}
                    {task.status === "in_progress" && (
                      <span className="text-[10.5px] text-[var(--s-muted)]">In progress</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SurfaceCard>
  );
}

type SortKey = "title" | "status" | "priority" | "due";

export function TaskTableView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const showCompleted = node.props.showCompleted !== false;
  const pageSize = typeof node.props.pageSize === "number" ? node.props.pageSize : 10;
  const dense = node.props.dense === true;
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [ascending, setAscending] = useState(true);

  const rows = useMemo(() => {
    const list = api.tasks.filter((task) => showCompleted || task.status !== "done");
    const sorted = [...list].sort((a, b) => {
      let result = 0;
      if (sortKey === "title") result = a.title.localeCompare(b.title);
      if (sortKey === "status") result = (a.status ?? "").localeCompare(b.status ?? "");
      if (sortKey === "priority") {
        result =
          (PRIORITY_ORDER[(a.priority ?? "medium") as TaskPriority] ?? 2) -
          (PRIORITY_ORDER[(b.priority ?? "medium") as TaskPriority] ?? 2);
      }
      if (sortKey === "due") result = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      return ascending ? result : -result;
    });
    return sorted.slice(0, pageSize);
  }, [api.tasks, showCompleted, pageSize, sortKey, ascending]);

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sortKey === key ? (ascending ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setAscending((value) => !value);
          else {
            setSortKey(key);
            setAscending(true);
          }
        }}
      >
        {label}
        {sortKey === key ? (
          ascending ? (
            <ArrowUp size={10} aria-hidden />
          ) : (
            <ArrowDown size={10} aria-hidden />
          )
        ) : (
          <ChevronsUpDown size={10} aria-hidden className="opacity-50" />
        )}
      </button>
    </th>
  );

  return (
    <SurfaceCard title={node.title} flush badge={<span className="pill pill-low">{rows.length}</span>}>
      {rows.length === 0 ? (
        <div className="p-3">
          <EmptyHint>No tasks to show. Create one and it lands here.</EmptyHint>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="t-table" aria-label={node.title}>
            <caption className="sr-only">{node.title} — sortable task table</caption>
            <thead>
              <tr>
                {header("title", "Task")}
                {header("status", "Status")}
                {header("priority", "Priority")}
                {header("due", "Due")}
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => {
                const due = dueMeta(task.dueDate);
                return (
                  <tr key={task.id} className={dense ? "[&>td]:py-1" : ""}>
                    <td>
                      <button
                        type="button"
                        onClick={() => api.openTask(task)}
                        className={`text-left text-[12.5px] hover:underline ${
                          task.status === "done" ? "text-[var(--s-faint)] line-through" : ""
                        }`}
                      >
                        {task.title}
                      </button>
                    </td>
                    <td className="whitespace-nowrap text-[11.5px] text-[var(--s-muted)]">
                      {task.status ? STATUS_LABEL[task.status] : "—"}
                    </td>
                    <td>{priorityPill(task.priority)}</td>
                    <td
                      className={`whitespace-nowrap text-[11.5px] ${
                        due.tone === "overdue" ? "font-medium text-red-500" : "text-[var(--s-muted)]"
                      }`}
                    >
                      {task.dueDate ? dueMeta(task.dueDate).label : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SurfaceCard>
  );
}

export function CalendarView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const offset = typeof node.props.monthOffset === "number" ? node.props.monthOffset : 0;
  const showCompleted = node.props.showCompleted !== false;

  const today = parseDate(todayIso())!;
  const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthLabel = formatMonth(year, month);

  const cells = useMemo(() => {
    const firstWeekday = (base.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    const result: Array<{
      date: Date;
      iso: string;
      outside: boolean;
      isToday: boolean;
      tasks: AppRecord[];
    }> = [];

    for (let index = 0; index < 42; index += 1) {
      const dayNumber = index - firstWeekday + 1;
      let date: Date;
      let outside = false;
      if (dayNumber < 1) {
        date = new Date(year, month - 1, daysInPrev + dayNumber);
        outside = true;
      } else if (dayNumber > daysInMonth) {
        date = new Date(year, month + 1, dayNumber - daysInMonth);
        outside = true;
      } else {
        date = new Date(year, month, dayNumber);
      }
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;
      const tasks = api.tasks.filter(
        (task) => task.dueDate === iso && (showCompleted || task.status !== "done"),
      );
      result.push({
        date,
        iso,
        outside,
        isToday: iso === todayIso(),
        tasks,
      });
    }
    return result;
  }, [api.tasks, base, month, year, showCompleted, today]);

  const updateOffset = (next: number) => api.updateNodeProps(node.id, { monthOffset: next });

  return (
    <SurfaceCard
      title={node.title}
      badge={<span className="pill pill-low">{monthLabel}</span>}
      actions={
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="s-btn s-btn-ghost tap-target h-6 w-6 px-0"
            onClick={() => updateOffset(offset - 1)}
            aria-label="Previous month"
          >
            <ArrowUp size={12} className="-rotate-90" aria-hidden />
          </button>
          <button
            type="button"
            className="s-btn s-btn-ghost h-6 px-1.5 text-[10.5px]"
            onClick={() => updateOffset(0)}
            disabled={offset === 0}
          >
            Today
          </button>
          <button
            type="button"
            className="s-btn s-btn-ghost tap-target h-6 w-6 px-0"
            onClick={() => updateOffset(offset + 1)}
            aria-label="Next month"
          >
            <ArrowDown size={12} className="-rotate-90" aria-hidden />
          </button>
        </div>
      }
    >
      <div className="cal-grid" role="grid" aria-label={`${monthLabel} calendar`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day} className="cal-dow" role="columnheader">
            <span aria-hidden>{day.slice(0, 1)}</span>
            <span className="sr-only">{day}</span>
          </div>
        ))}
        {cells.map((cell) => (
          <div
            key={cell.iso + String(cell.outside)}
            role="gridcell"
            className="cal-cell"
            data-outside={cell.outside}
            data-today={cell.isToday}
            aria-label={`${formatDateLong(cell.iso)}${cell.tasks.length ? `, ${cell.tasks.length} tasks` : ""}`}
          >
            <span className="cal-day">{cell.date.getDate()}</span>
            {cell.tasks.slice(0, 2).map((task) => (
              <button
                key={task.id}
                type="button"
                className="cal-task"
                onClick={() => api.openTask(task)}
                title={task.title}
              >
                {task.title}
              </button>
            ))}
            {cell.tasks.length > 2 && (
              <span className="text-[9px] text-[var(--s-faint)]">+{cell.tasks.length - 2} more</span>
            )}
          </div>
        ))}
      </div>
    </SurfaceCard>
  );
}

export function CalendarLegend() {
  return (
    <p className="flex items-center gap-1 text-[10.5px] text-[var(--s-faint)]">
      <Plus size={10} aria-hidden />
      Tasks appear on their due date
    </p>
  );
}
