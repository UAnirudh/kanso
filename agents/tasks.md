# Agent task board

The one mutable shared file in this repo. Claim work here **before** you start, so two agents never
build the same thing on different branches.

Rules

- Add or edit **your own row only**. Do not renumber, delete or reorder other rows.
- One row per task. Keep the scope to a single line that a stranger could act on.
- Status vocabulary: `todo` (nobody on it) · `claimed` (someone is working) · `blocked` (waiting on a
  person or another task — say what) · `review` (code done, handoff written) · `done`.
- When you finish, set the row to `review`/`done` and link the log entry you wrote under `agents/log/`.
- Found something unrelated while working? Add a row. Do not fix it in passing (AGENTS.md §9.3).

| ID | Scope | Owner | Branch | Status | Log |
| --- | --- | --- | --- | --- | --- |
| T-001 | Hard load / refresh of `/apps/[appId]` sticks on the `loading.tsx` skeleton forever; client navigation and `curl` (200, ~34 ms) both work. Candidate fixes: (a) drop the route-level `loading.tsx`, or (b) render the skeleton inside `WorkspaceClient` for client transitions. Pick one with the human before changing app code. | — | — | todo | — |
| T-002 | Commit `003dde6` (the `npm ci` / `@types/node` fix) is local only; `origin/main` still pins `22.10.2`, so a Render build from `main` fails in the `deps` stage. Then apply the Blueprint in the Render dashboard with `GROQ_API_KEY` blank. | human | — | blocked (needs explicit push + dashboard approval) | `agents/log/2026-11-20-agent-docs.md` |
| T-003 | `docker/smoke-test.sh` is untracked in the working tree. Decide whether to commit it as the documented engine test (it passes: build → volume → restart persistence). | — | — | todo | — |
| T-004 | AI success path is only transport-verified. Add a recorded-transcript fixture so the model-backed acceptance run is deterministic in CI (IMPLEMENTATION_PLAN.md, "Next three highest-value improvements" #1). | — | — | todo | — |

## Backlog (not yet scoped)

- Postgres migration + hosted deployment (ADR-1 exit path: `jsonb` documents, `?` → `$1`, diffs
  instead of snapshots).
- Visual regression snapshots and an axe accessibility audit in CI.
- Streaming proposal generation; per-page saved presets; proposal diff view before apply.
