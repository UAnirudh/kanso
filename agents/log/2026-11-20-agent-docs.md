# Agent docs and collaboration setup

- Date: 2026-11-20
- Agent: Buffy (Freebuff)
- Task: none (repository setup)
- Branch: `main` working tree

## Goal
Make the repository usable by several agents at once: one canonical instruction file, an explicit
set of invariants, and a conflict-free way to claim work and hand it off.

## Changed
- `AGENTS.md` (new) — canonical contract: invariants (ADR-linked), verification ladder, layout map,
  conventions, this machine's gotchas, and the multi-agent protocol.
- `CLAUDE.md` (new) — pointer to `AGENTS.md` only, so the rules cannot drift between two copies.
- `agents/tasks.md` (new) — shared claim board; one row per task, seeded with the real open items.
- `agents/log/README.md` (new) — naming, append-only rules, handoff template, index.
- `agents/log/2026-11-20-docker-persistence.md` (new) — the Docker/Render session that preceded this.
- `README.md` — corrected the "Verified vs unverified" paragraph, which still claimed Docker was not
  installed on this machine.

`docs/` was deliberately left alone: it is the published GitHub Pages site (`docs/index.html`), not
working documentation.

## Verified
- Documentation-only change: no application code, schema, dependency or config was touched, so
  `typecheck` / `test` / `build` were not re-run (they were green in the preceding session).
- Every path referenced in `AGENTS.md` exists in the working tree (checked with file tools while
  writing it): `app/actions.ts`, `app/apps/[appId]/page.tsx`, `components/workspace/render/registry.tsx`,
  `lib/interface/{catalog,operations,engine,service,store,templates,controls}.ts`,
  `lib/ai/{provider,prompt,local-planner,pipeline}.ts`, `lib/repo/*`, `lib/{db,api,errors,identity}.ts`,
  `scripts/{migrate,reset,shots,ai-provider-check}.mjs`, `migrations/`, `tests/`, `e2e/`, `docker/`.

## Not verified
- No rendering check of the Markdown (not a web artifact).
- Nothing about the app's runtime behaviour was re-tested here; see the persistence entry for that.

## Next step
T-002: get `003dde6` pushed (human approval) and apply the Render Blueprint, then record the deploy in
a new log entry. T-001 needs a decision from the human between the two candidate fixes.

## Open questions
- T-001: drop `app/apps/[appId]/loading.tsx`, or move the skeleton inside `WorkspaceClient`?
- T-003: commit `docker/smoke-test.sh` or keep it local?
