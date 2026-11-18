"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Sparkles } from "lucide-react";
import { createApplicationAction, createWorkspaceAction } from "@/app/actions";
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
