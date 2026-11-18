# Implementation plan

Status legend: `[x]` implemented and verified · `[~]` implemented, limited verification ·
`[ ]` not implemented (documented as a non-goal or next step).

## Phase 1 — Product specification

- [x] PRD with vision, audience, problem, UVP, workflows, competitive positioning, MVP scope,
      success metrics, risks, non-goals (`PRD.md`).
- [x] MVP use case chosen: shared project workspace + per-user adaptive interface with AI edits.
- [x] Existing builders evaluated on public positioning; differentiation defined (not "AI makes
      it better").

## Phase 2 — Technical architecture

- [x] Stack decision and ADR (`ARCHITECTURE.md` §9).
- [x] Interface document schema with schema version, theme/accent/density/nav/page/component
      structure.
- [x] Operation vocabulary (14) with Zod discriminated union and hard limits.
- [x] Relational model for users, sessions, workspaces, memberships, apps, pages, records,
      interface definitions, per-user interfaces, revisions, AI requests, rate limits.
- [x] Authorization matrix and module boundaries.

## Phase 3 — Design system

- [x] Tokens for chrome and surface themes; five accents; two densities; 12-column layout rules.
- [x] Primitives: buttons, fields, chips, modal, drawer, toasts, skeletons, empty states.
- [x] Premium workspace shell: sidebar, top bar, canvas, assistant panel, history drawer.
- [x] Surface card system shared by all ten components.
- [x] Responsive behaviour: desktop, tablet (span clamp), phone (single column, swipeable kanban,
      slide-over assistant and navigation).
- [x] Visual gate: 15 screenshots captured and inspected; four layout defects found and fixed
      (stacked filter bar, overlapping edit toolbars, overflowing chart labels, empty stat cell).

## Phase 4 — Application foundation

- [x] Anonymous device identity (httpOnly cookie, server-provisioned guest row); no sign-in.
- [x] One shared workspace joined automatically on first visit, plus private workspace creation.
- [x] Database migrations, migration runner, reset script.
- [x] Application generation from two constrained templates with seeded tasks and notes.
- [x] Task/note CRUD API with role enforcement and validation.
- [x] Member management API (change role, remove); guests join the shared workspace automatically.

## Phase 5 — Interface rendering engine

- [x] `normalizeDocument` repair/migration pass.
- [x] Deterministic overlap-free layout packing with requested-column preference.
- [x] Ten functional components bound to real records (board, list, table, calendar, charts,
      stats, quick add, filters, notes, activity).
- [x] Stable ids, typed props with defaults, data-source allowlists, span bounds.
- [x] Accessible chart alternatives (hidden tables), table sorting with `aria-sort`, live counts.

## Phase 6 — AI customization engine

- [x] Provider abstraction (`completeChat`) with Groq implementation, configurable model/base URL.
- [x] Prompt construction from catalogue + current interface + page keys.
- [x] JSON parsing, envelope + operation validation, atomic apply, semantic checks.
- [x] One repair round on invalid output; bounded retry on 5xx; timeouts; 429 mapping.
- [x] Per-user sliding-window rate limit; token/latency/model audit rows.
- [x] Deterministic local planner fallback with per-clause direction handling, clearly labelled.
- [x] Proposal persistence with stale-base detection; preview without saving; apply/discard.
- [x] `[~]` Live Groq model call: transport/error path exercised with an invalid key; a successful
      completion requires a real `GROQ_API_KEY` (not available in this environment).

## Phase 7 — Personalization and versioning

- [x] One interface document per `(app, user)`; new members fork the generated base definition.
- [x] Revision kinds `init | ai | manual | restore | undo`, labels, full snapshots, operations.
- [x] Undo (previous snapshot as new revision) and restore (any snapshot as new revision).
- [x] History drawer with per-version restore; isolation verified in the acceptance test.

## Phase 8 — Application generation

- [x] Constrained template selection from prompt signals (project workspace vs personal tracker).
- [x] Working pages: overview, board, calendar, analytics (project) / today, calendar, progress
      (personal), each with real components.
- [x] Seed data that exercises overdue, in-progress, completed and priority states.
- [x] Base definition persisted per page so every member starts from the same generated app.

## Phase 9 — Testing

- [x] Unit: `tests/engine.test.ts` (17), `tests/local-planner.test.ts` (6),
      `tests/validation.test.ts` (8) — 31 passing.
- [x] End-to-end: `e2e/acceptance.spec.ts` — full 16-step acceptance scenario plus a
      cross-workspace/authorization spec — 2 passing.
- [x] `npm run typecheck` clean, `npm run build` clean.
- [x] Visual QA harness (`node scripts/shots.mjs`) producing 16 screenshots, no console errors.
- [~] AI success path E2E: runs through the deterministic planner; a model-backed run needs a key.

## Phase 10 — Polish and iteration

- [x] Fixed: filter bar stacking (CSS cascade layer), kanban clipping on phones, chart label
      overflow, empty stat cell, overlapping edit toolbars, duplicate `id` for the assistant panel.
- [x] Loading, empty, error and preview states on the primary surfaces.
- [x] Keyboard: Escape closes dialogs/drawers, focus restored, edit toolbars are real buttons,
      Cmd/Ctrl-free single-key flows, visible focus rings.
- [x] Reduced-motion support; contrast checked in light and dark surface themes.
- [ ] Browser-level visual regression snapshots in CI.
- [ ] Automated accessibility audit (axe) in CI.

## Next three highest-value improvements

1. **Model-backed acceptance run in CI with a funded `GROQ_API_KEY`**, including a recorded
   transcript fixture for deterministic replay, so the AI path is continuously verified rather
   than transport-only.
2. **Postgres migration + hosted deployment**, with documents in `jsonb`, revision diffs instead
   of snapshots, and per-workspace AI budget caps.
3. **Deeper personalization controls**: drag-and-drop on the canvas, per-page saved presets,
   a "start from another member's layout" flow, and a proposal diff view before apply.

## Backlog after that

- Streaming proposal generation for long requests.
- Invitations by email, SSO, workspace-level design defaults.
- Behaviour-derived suggestions (explicit opt-in, never silent adaptation).
- Interface schema v2 with nested containers and tabs.
