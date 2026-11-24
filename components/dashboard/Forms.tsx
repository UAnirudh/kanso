"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  createApplicationAction,
  createWorkspaceAction,
  deleteApplicationAction,
  renameApplicationAction,
} from "@/app/actions";
import type { FormState } from "@/lib/form-state";

function Submit({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn ${variant === "primary" ? "btn-primary" : "btn-secondary"}`}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

const SUGGESTIONS = [
  "A project workspace with a kanban board, calendar and delivery analytics",
  "A personal daily tracker with a task list, calendar and progress chart",
];

export function NewAppForm({
  workspaces,
}: {
  workspaces: Array<{ id: string; name: string }>;
}) {
  const [state, action] = useActionState(createApplicationAction, {} as FormState);
  const [prompt, setPrompt] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />

      <label className="label" htmlFor="app-prompt">
        Describe the application
      </label>
      <textarea
        id="app-prompt"
        name="prompt"
        required
        minLength={8}
        maxLength={600}
        rows={4}
        className="field"
        placeholder="Create a project management application with a task board, calendar and analytics…"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="chip text-left"
            onClick={() => setPrompt(suggestion)}
          >
            <Sparkles size={11} aria-hidden />
            {suggestion.length > 46 ? `${suggestion.slice(0, 44)}…` : suggestion}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="app-name">
            Name <span className="normal-case text-[#3a3f4a]">(optional)</span>
          </label>
          <input
            id="app-name"
            name="name"
            className="field"
            placeholder="Northstar delivery"
            maxLength={60}
          />
        </div>
        <div>
          <label className="label" htmlFor="app-workspace">
            Workspace
          </label>
          <select
            id="app-workspace"
            className="field"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="mt-3 text-[12px] text-red-300">
          {state.error}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-[#5f626b]">
          Generated from a constrained template: real tasks, pages and components — no mockups.
        </p>
        <Submit label="Generate" pendingLabel="Generating…" />
      </div>
    </form>
  );
}

export function AppCardActions({
  appId,
  appName,
  canManage,
}: {
  appId: string;
  appName: string;
  canManage: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameState, renameAction] = useActionState(renameApplicationAction, {} as FormState);
  const [deleteState, deleteAction] = useActionState(deleteApplicationAction, {} as FormState);

  useEffect(() => {
    if (renameState.ok) setRenaming(false);
  }, [renameState]);

  if (!canManage) return null;

  if (renaming) {
    return (
      <form action={renameAction} className="flex flex-col gap-1.5 border-t border-[#16191e] px-4 py-2.5">
        <input type="hidden" name="appId" value={appId} />
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor={`rename-${appId}`}>
            New name for {appName}
          </label>
          <input
            id={`rename-${appId}`}
            name="name"
            defaultValue={appName}
            maxLength={60}
            required
            autoFocus
            className="field h-[30px] text-[12px]"
          />
          <button
            type="submit"
            className="btn btn-ghost btn-icon shrink-0"
            aria-label="Save name"
          >
            <Check size={13} aria-hidden />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon shrink-0"
            aria-label="Cancel rename"
            onClick={() => setRenaming(false)}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
        {renameState.error && (
          <p role="alert" className="text-[11px] text-red-300">
            {renameState.error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form action={deleteAction} className="flex items-center gap-1.5 border-t border-[#16191e] px-4 py-2">
      <input type="hidden" name="appId" value={appId} />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setRenaming(true)}
      >
        <Pencil size={11} aria-hidden />
        Rename
      </button>
      <button
        type={confirmDelete ? "submit" : "button"}
        className={`btn btn-ghost btn-sm ${confirmDelete ? "text-red-300" : ""}`}
        onClick={() => setConfirmDelete(true)}
        aria-label={confirmDelete ? `Confirm deleting ${appName}` : `Delete ${appName}`}
      >
        <Trash2 size={11} aria-hidden />
        {confirmDelete ? "Confirm delete" : "Delete"}
      </button>
      {confirmDelete && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setConfirmDelete(false)}
        >
          Cancel
        </button>
      )}
      {deleteState.error && (
        <p role="alert" className="ml-auto text-[11px] text-red-300">
          {deleteState.error}
        </p>
      )}
    </form>
  );
}

export function NewWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, {} as FormState);
  const [name, setName] = useState("");

  return (
    <form
      action={action}
      className="mt-3"
      onSubmit={() => {
        window.setTimeout(() => setName(""), 50);
      }}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="workspace-name">
          New workspace name
        </label>
        <input
          id="workspace-name"
          name="name"
          className="field"
          placeholder="New workspace name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          required
        />
        <button type="submit" className="btn btn-secondary shrink-0" aria-label="Create workspace">
          <Plus size={14} aria-hidden />
        </button>
      </div>
      {state?.error && (
        <p role="alert" className="mt-2 text-[12px] text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
