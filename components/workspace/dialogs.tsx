"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PROP_CONTROLS, type PropControl } from "@/lib/interface/controls";
import { CATALOG } from "@/lib/interface/catalog";
import { PRIORITY_LABEL, STATUS_LABEL, type InterfaceNode, type TaskPriority, type TaskStatus } from "@/lib/interface/types";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import type { MemberView, NodeSettingsRequest, TaskDialogState } from "./types";

/* -------------------------------------------------------------------------- */
/* Task dialog                                                                */
/* -------------------------------------------------------------------------- */

export function TaskDialog({
  open,
  state,
  canEdit,
  busy,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  state: TaskDialogState | null;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: string | null;
  }) => Promise<boolean>;
  onUpdate: (
    id: string,
    patch: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      dueDate?: string | null;
    },
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmDelete(false);
    if (state?.mode === "edit" && state.task) {
      setTitle(state.task.title);
      setDescription(state.task.description);
      setStatus((state.task.status as TaskStatus) ?? "todo");
      setPriority((state.task.priority as TaskPriority) ?? "medium");
      setDueDate(state.task.dueDate ?? "");
    } else {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setDueDate("");
    }
  }, [open, state]);

  const editing = state?.mode === "edit" && state.task;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Add a title.");
      return;
    }
    setError(null);
    const payload = {
      title: title.trim(),
      description,
      status,
      priority,
      dueDate: dueDate || null,
    };
    const ok =
      editing && state?.task
        ? await onUpdate(state.task.id, payload)
        : await onCreate(payload);
    if (ok) onClose();
    else setError("Could not save. Your workspace access may be read-only.");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
      description={editing ? "Changes are visible to every workspace member." : "It appears in every task view immediately."}
    >
      <form onSubmit={submit}>
        <label className="label" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          className="field"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          disabled={!canEdit}
          required
        />

        <div className="mt-3">
          <label className="label" htmlFor="task-description">
            Description
          </label>
          <textarea
            id="task-description"
            className="field"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            disabled={!canEdit}
            placeholder="Context, links, acceptance criteria…"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="task-status">
              Status
            </label>
            <select
              id="task-status"
              className="field"
              value={status}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
              disabled={!canEdit}
            >
              {(["todo", "in_progress", "done"] as const).map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="task-priority">
              Priority
            </label>
            <select
              id="task-priority"
              className="field"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
              disabled={!canEdit}
            >
              {(["low", "medium", "high", "urgent"] as const).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="label" htmlFor="task-due">
            Due date
          </label>
          <input
            id="task-due"
            type="date"
            className="field"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            disabled={!canEdit}
          />
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[12px] text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {editing && state?.task && canEdit && (
              <button
                type="button"
                className={`btn tap-target ${confirmDelete ? "btn-danger" : "btn-ghost"} btn-sm`}
                onClick={async () => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  const ok = await onDelete(state.task!.id);
                  if (ok) onClose();
                  else setError("Could not delete this task.");
                }}
                disabled={busy}
              >
                <Trash2 size={12} aria-hidden />
                {confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || !canEdit}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create task"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Component settings (visual prop editing)                                   */
/* -------------------------------------------------------------------------- */

export function ComponentSettingsDialog({
  request,
  busy,
  onClose,
  onApply,
}: {
  request: NodeSettingsRequest | null;
  busy: boolean;
  onClose: () => void;
  onApply: (page: string, nodeId: string, props: Record<string, unknown>) => Promise<boolean>;
}) {
  const node: InterfaceNode | null = request?.node ?? null;
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!node) return;
    setDraft({ ...node.props });
    setError(null);
  }, [node]);

  if (!node) return null;
  const controls = PROP_CONTROLS[node.type] ?? [];

  const update = (control: PropControl, value: unknown) => {
    setDraft((current) => ({ ...current, [control.key]: value }));
  };

  const toggleMulti = (control: PropControl, value: string) => {
    const current = Array.isArray(draft[control.key]) ? (draft[control.key] as string[]) : [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    if (next.length === 0) {
      setError("Keep at least one option selected.");
      return;
    }
    setError(null);
    update(control, next);
  };

  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      title={`${CATALOG[node.type].label} settings`}
      description="These are the component's approved properties. Changes save to your interface only."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              if (error) return;
              const ok = await onApply(request!.page, node.id, draft);
              if (ok) onClose();
            }}
          >
            {busy ? "Saving…" : "Save settings"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {controls.length === 0 && (
          <p className="text-[13px] text-[#82858f]">This component has no editable settings.</p>
        )}
        {controls.map((control) => {
          if (control.type === "boolean") {
            return (
              <label
                key={control.key}
                className="flex items-center justify-between gap-4 rounded-[8px] border border-[#1c1f25] bg-[#0d0f13] px-3 py-2.5"
              >
                <span className="text-[12.5px] text-[#c8cad2]">{control.label}</span>
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#8b7cf8]"
                  checked={Boolean(draft[control.key])}
                  onChange={(event) => update(control, event.target.checked)}
                />
              </label>
            );
          }
          if (control.type === "number") {
            return (
              <div key={control.key}>
                <label className="label" htmlFor={`prop-${control.key}`}>
                  {control.label}
                </label>
                <input
                  id={`prop-${control.key}`}
                  type="number"
                  className="field"
                  min={control.min}
                  max={control.max}
                  value={Number(draft[control.key] ?? control.min)}
                  onChange={(event) =>
                    update(
                      control,
                      Math.min(control.max, Math.max(control.min, Number(event.target.value))),
                    )
                  }
                />
              </div>
            );
          }
          if (control.type === "enum") {
            return (
              <div key={control.key}>
                <label className="label" htmlFor={`prop-${control.key}`}>
                  {control.label}
                </label>
                <select
                  id={`prop-${control.key}`}
                  className="field"
                  value={String(draft[control.key] ?? control.options[0]?.value ?? "")}
                  onChange={(event) => {
                    const raw = event.target.value;
                    update(control, control.key === "weeks" ? Number(raw) : raw);
                  }}
                >
                  {control.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }
          if (control.type === "text") {
            return (
              <div key={control.key}>
                <label className="label" htmlFor={`prop-${control.key}`}>
                  {control.label}
                </label>
                <input
                  id={`prop-${control.key}`}
                  className="field"
                  maxLength={control.maxLength}
                  value={String(draft[control.key] ?? "")}
                  onChange={(event) => update(control, event.target.value)}
                />
              </div>
            );
          }
          const selected = Array.isArray(draft[control.key]) ? (draft[control.key] as string[]) : [];
          return (
            <fieldset key={control.key}>
              <legend className="label">{control.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {control.options.map((option) => {
                  const active = selected.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleMulti(control, option.value)}
                      className={`chip ${active ? "border-[#8b7cf8]/50 bg-[#8b7cf8]/12 text-[#c4baff]" : ""}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        {error && (
          <p role="alert" className="text-[12px] text-red-300">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Members / sharing                                                          */
/* -------------------------------------------------------------------------- */

export function MembersDialog({
  open,
  members,
  canManage,
  busy,
  onClose,
  onChangeRole,
  onRemove,
}: {
  open: boolean;
  members: MemberView[];
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onChangeRole: (userId: string, role: Role) => Promise<string | null>;
  onRemove: (userId: string) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workspace members"
      description="Every browser that opens Kanso joins this workspace automatically. Data is shared; each browser keeps its own interface."
    >
      <ul className="divide-y divide-[#16191e]">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] text-[#e8e9ee]">{member.name}</p>
              <p className="truncate text-[11px] text-[#6b6f7a]">
                {member.role === "owner" ? "Created this workspace" : "Joined from another browser"}
              </p>
            </div>
            {canManage && member.role !== "owner" ? (
              <div className="flex items-center gap-1.5">
                <label className="sr-only" htmlFor={`role-${member.userId}`}>
                  Role for {member.name}
                </label>
                <select
                  id={`role-${member.userId}`}
                  className="field h-11 w-[92px] text-[11.5px]"
                  value={member.role}
                  disabled={busy}
                  onChange={async (event) => {
                    const message = await onChangeRole(member.userId, event.target.value as Role);
                    setError(message);
                  }}
                >
                  {(["admin", "member", "viewer"] as const).map((value) => (
                    <option key={value} value={value}>
                      {ROLE_LABEL[value]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={async () => {
                    const message = await onRemove(member.userId);
                    setError(message);
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <span className="rounded-full border border-[#262a32] px-2 py-0.5 text-[10.5px] text-[#82858f]">
                {ROLE_LABEL[member.role]}
              </span>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-[12px] text-red-300">
          {error}
        </p>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-[#5f626b]">
        Roles: <strong className="text-[#82858f]">owner/admin</strong> manage members and settings ·{" "}
        <strong className="text-[#82858f]">member</strong> edits tasks ·{" "}
        <strong className="text-[#82858f]">viewer</strong> reads only. Interface customisation is
        always private to the browser making it.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-[#5f626b]">
        There is no sign-in yet, so a guest name identifies a browser rather than a verified
        person, and clearing this browser&apos;s cookies starts a new guest. No browser owns the
        shared workspace, so a new guest can still manage it and remove the stale row.
      </p>
    </Modal>
  );
}
