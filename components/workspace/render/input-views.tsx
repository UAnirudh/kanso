"use client";

import { useState } from "react";
import { Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import type { InterfaceNode, TaskPriority } from "@/lib/interface/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/interface/types";
import { relativeTime } from "@/lib/format";
import { useSurface } from "./context";
import { EmptyHint, SurfaceCard } from "./SurfaceCard";

export function FilterBarView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const showSearch = node.props.showSearch !== false;
  const showStatus = node.props.showStatus !== false;
  const showPriority = node.props.showPriority !== false;
  const active =
    api.filters.search !== "" || api.filters.status !== "all" || api.filters.priority !== "all";

  return (
    <div
      className="card-surface flex flex-wrap items-center gap-2 px-3 py-2.5"
      role="search"
      aria-label={node.title || "Task filters"}
    >
      {showSearch && (
        <div className="relative min-w-[160px] flex-1">
          <Search
            size={13}
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--s-faint)]"
          />
          <label className="sr-only" htmlFor={`filter-search-${node.id}`}>
            Search tasks
          </label>
          <input
            id={`filter-search-${node.id}`}
            type="search"
            className="s-input pl-7"
            placeholder="Search tasks…"
            value={api.filters.search}
            onChange={(event) => api.setFilters({ search: event.target.value })}
          />
        </div>
      )}

      {showStatus && (
        <>
          <label className="sr-only" htmlFor={`filter-status-${node.id}`}>
            Filter by status
          </label>
          <select
            id={`filter-status-${node.id}`}
            className="s-input w-auto"
            value={api.filters.status}
            onChange={(event) =>
              api.setFilters({ status: event.target.value as typeof api.filters.status })
            }
          >
            <option value="all">All statuses</option>
            {(["todo", "in_progress", "done"] as const).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </>
      )}

      {showPriority && (
        <>
          <label className="sr-only" htmlFor={`filter-priority-${node.id}`}>
            Filter by priority
          </label>
          <select
            id={`filter-priority-${node.id}`}
            className="s-input w-auto"
            value={api.filters.priority}
            onChange={(event) =>
              api.setFilters({ priority: event.target.value as typeof api.filters.priority })
            }
          >
            <option value="all">Any priority</option>
            {(["urgent", "high", "medium", "low"] as const).map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </>
      )}

      <p aria-live="polite" className="ml-auto whitespace-nowrap text-[10.5px] text-[var(--s-faint)]">
        {api.tasks.length} of {api.allTasks.length} tasks
      </p>

      {active && (
        <button
          type="button"
          className="s-btn s-btn-ghost h-6 px-1.5 text-[10.5px]"
          onClick={() => api.setFilters({ search: "", status: "all", priority: "all" })}
        >
          <RotateCcw size={10} aria-hidden />
          Reset
        </button>
      )}
    </div>
  );
}

export function QuickCreateTaskView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(
    (node.props.defaultPriority as TaskPriority) ?? "medium",
  );
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError("Give the task a title first.");
      return;
    }
    const ok = await api.createTask({
      title: title.trim(),
      priority,
      dueDate: dueDate || null,
      status: (node.props.defaultStatus as "todo" | "in_progress") ?? "todo",
    });
    if (ok) {
      setTitle("");
      setDueDate("");
    } else {
      setError("The task could not be saved. Try again.");
    }
  };

  const buttonLabel = String(node.props.buttonLabel ?? "") || "Add task";

  return (
    <SurfaceCard title={node.title}>
      <form onSubmit={submit} className="space-y-2">
        <label className="sr-only" htmlFor={`quick-title-${node.id}`}>
          Task title
        </label>
        <input
          id={`quick-title-${node.id}`}
          className="s-input"
          placeholder="What needs doing?"
          value={title}
          maxLength={140}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!api.canEdit || api.busy}
        />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor={`quick-priority-${node.id}`}>
            Priority
          </label>
          <select
            id={`quick-priority-${node.id}`}
            className="s-input s-input-sm flex-1"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            disabled={!api.canEdit || api.busy}
          >
            {(["low", "medium", "high", "urgent"] as const).map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`quick-due-${node.id}`}>
            Due date
          </label>
          <input
            id={`quick-due-${node.id}`}
            type="date"
            className="s-input s-input-sm flex-1"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={!api.canEdit || api.busy}
          />
        </div>
        <button
          type="submit"
          className="s-btn s-btn-primary w-full"
          disabled={!api.canEdit || api.busy}
        >
          <Plus size={13} aria-hidden />
          {api.busy ? "Saving…" : buttonLabel}
        </button>
        {!api.canEdit && (
          <p className="text-[10.5px] text-[var(--s-faint)]">
            You have view-only access in this workspace.
          </p>
        )}
        <p aria-live="polite" className="min-h-[14px] text-[10.5px] text-red-500">
          {error}
        </p>
      </form>
    </SurfaceCard>
  );
}

export function NotesPanelView({ node }: { node: InterfaceNode }) {
  const api = useSurface();
  const maxItems = typeof node.props.maxItems === "number" ? node.props.maxItems : 4;
  const allowAdd = node.props.allowAdd !== false;
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const notes = api.notes.slice(0, maxItems);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    const ok = await api.createNote(draft.trim());
    if (ok) setDraft("");
  };

  const remove = async (noteId: string) => {
    if (confirming !== noteId) {
      setConfirming(noteId);
      return;
    }
    const ok = await api.deleteNote(noteId);
    if (ok) setConfirming(null);
  };

  return (
    <SurfaceCard title={node.title} badge={<span className="pill pill-low">{api.notes.length}</span>}>
      {notes.length === 0 ? (
        <EmptyHint>Shared notes appear here, visible to every member.</EmptyHint>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-[7px] border border-[var(--s-border)] bg-[var(--s-panel-alt)] px-2.5 py-2"
            >
              <div className="flex items-start justify-between gap-1.5">
                <p className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[var(--s-text)]">
                  {note.title}
                </p>
                {api.canEdit && (
                  <button
                    type="button"
                    onClick={() => void remove(note.id)}
                    disabled={api.busy}
                    aria-label={
                      confirming === note.id
                        ? `Confirm deleting note ${note.title}`
                        : `Delete note ${note.title}`
                    }
                    className={`relative -mr-1 -mt-0.5 shrink-0 rounded-[4px] px-1 py-0.5 text-[9.5px] transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] disabled:opacity-40 ${
                      confirming === note.id
                        ? "bg-red-500/15 font-medium text-red-400"
                        : "text-[var(--s-muted)] hover:bg-red-500/10 hover:text-red-400"
                    }`}
                  >
                    {confirming === note.id ? "Delete?" : <Trash2 size={11} aria-hidden />}
                  </button>
                )}
              </div>
              {note.description && note.description !== note.title && (
                <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-[var(--s-muted)]">
                  {note.description}
                </p>
              )}
              <time dateTime={note.createdAt} className="mt-1 block text-[9.5px] text-[var(--s-faint)]">
                {relativeTime(note.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}

      {allowAdd && api.canEdit && (
        <form onSubmit={submit} className="mt-2.5 flex gap-1.5">
          <label className="sr-only" htmlFor={`note-compose-${node.id}`}>
            New note
          </label>
          <input
            id={`note-compose-${node.id}`}
            className="s-input s-input-sm"
            placeholder="Add a note…"
            value={draft}
            maxLength={140}
            onChange={(event) => setDraft(event.target.value)}
            disabled={api.busy}
          />
          <button
            type="submit"
            className="s-btn s-btn-primary h-[27px] shrink-0 px-2"
            aria-label="Save note"
            disabled={api.busy || !draft.trim()}
          >
            <Plus size={12} aria-hidden />
          </button>
        </form>
      )}
    </SurfaceCard>
  );
}
