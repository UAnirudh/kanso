# Diff follow-up: catalog summaries, README and an acceptance assertion (T-011)

- Date: 2026-11-26
- Agent: codebuff
- Task: T-011
- Branch: `agent/interface-diff` (based on `main`; pushed with this entry)

## Goal

Review of the first diff pass asked for four things: stop showing raw prop keys, correct the README
limitation that still claimed there was no diff viewer, assert the new panel in the acceptance
suite, and run that suite. This entry records the follow-up only; the first pass is in
`2026-11-26-interface-diff.md` and is unchanged.

## Changed

- `lib/interface/diff.ts` — a prop change now reports the catalog's own summaries, comparing
  `CATALOG[type].summarizeProps(before)` with `summarizeProps(after)`:
  `Changed “My tasks” settings: sorted by due → sorted by priority, completed hidden on Overview`.
  When the summary is unchanged but props differ, it says `Changed “X” settings`; internal prop
  keys are never printed.
- `tests/interface-diff.test.ts` — the component test now changes `sort` as well as
  `showCompleted`, asserts the summary sentence, and asserts the joined output does **not** contain
  `showCompleted`.
- `e2e/acceptance.spec.ts` — after “Proposed change”, the main flow asserts “What changes” is
  visible, the `Interface changes` list is present with at least one item, and it contains
  `Theme: light → dark`.
- `README.md` — the known-limitations bullet now says there is no operation-level redo stack and no
  diff view for history, while the assistant preview does show a component-level diff of a
  proposal before it is applied.
- `agents/tasks.md`, `agents/log/README.md` — T-011 links this entry too; index row appended.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → 74/74 in 9 files.
- `npm run build` → exit 0.
- `npm run test:e2e` → **4 passed (1.7 m)**:
  - `e2e\acceptance.spec.ts:35` per-browser adaptive interface — 56.0 s (now includes the
    “What changes” list and `Theme: light → dark` assertions),
  - `application and interface lifecycle controls` — 12.9 s,
  - `identity, health and role boundaries are enforced server-side` — 9.7 s,
  - `security headers are set and the app still hydrates under CSP` — 6.7 s.

## Not verified

- No screenshot or visual review of the panel; the acceptance test proves the list is rendered and
  carries the expected text in Chromium, not that it looks right.
- Screen-reader announcement of the list was not tested.
- No live Groq proposal (no key); the suite runs the deterministic local planner.

## Next step

Push `agent/interface-diff` and open the PR against `main`; CI runs the same unit and acceptance
suites on the runner.

## Open questions

- Should history revisions get the same diff (the remaining half of the “diff viewer” limitation)?
