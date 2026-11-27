# A component-level diff in the assistant preview (T-011)

- Date: 2026-11-26
- Agent: codebuff
- Task: T-011
- Branch: `agent/interface-diff` (based on `main`; local, not pushed)

## Goal

Applying an assistant proposal was blind: the panel repeated the operations, then offered
**Apply change** and a canvas preview that only outlines changed nodes. Both the base and the
proposed document are already stored on `ai_requests`, so the preview can say exactly what will
change. This is the first step of T-011; presets and drag-to-rearrange remain open.

## Changed

- `lib/interface/diff.ts` (new) — `diffInterfaces(base, next, options)` returns plain entries for
  theme, accent, density, navigation, home page, page add/remove/layout, and per component:
  add, remove, type replacement, rename, show/hide, move, resize, binding change, prop keys
  (`Changed limit and showCompleted on “My tasks”`) and pure reorder. Page keys become titles when
  `pageTitles` is supplied; `limit` caps the list. No React, no database, no model output.
- `components/workspace/AiPanel.tsx` — the proposal card renders a **What changes** list with a
  per-tone icon (plus / minus / arrow) and the entry text, capped at 8 with “and N more”. The
  previous operation list remains as the fallback when the diff is empty. The list is a real
  `<ul aria-label="Interface changes">`.
- `components/workspace/WorkspaceClient.tsx` — computes the diff once per proposal from
  `proposal.baseDocument` and `proposal.proposedDocument`, with page titles from `props.pages`.
  Diffing the stored base (rather than the tab's current document) means a stale tab cannot show
  a misleading diff; applying it still fails the server's stale-base check.
- `lib/ai/pipeline.ts` — the `proposeInterfaceChange` response now includes `baseDocument`, the
  document the proposal was built from, alongside `proposedDocument`.
- `components/workspace/types.ts` — `AiProposalView` carries `baseDocument` too.
- `tests/interface-diff.test.ts` (new) — 7 tests pin the exact sentences for settings/navigation,
  component changes, resize vs move, page changes, pure reorder, no-op and the limit.
- `agents/tasks.md`, `agents/log/README.md` — T-011 set to `review` with this entry linked.

No migration, no new dependency, no schema change. The diff is derived data; nothing new is stored.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → **74/74 in 9 files** (was 70/70; +7 diff tests, no existing test changed).
- `npm run build` → exit 0; `/apps/[appId]` compiles as a dynamic route (52.5 kB page).
- The test file asserts full sentence lists for the document-level case and the resize case, and
  `toContain` for each component-level sentence, so a wording or ordering regression fails.

## Not verified

- The rendered panel was **not** viewed in a browser and no screenshot was taken. The JSX compiles
  and the diff function is unit-tested, but the visual layout, the 8-entry cap and the icons have
  not been inspected.
- `npm run test:e2e` was not run locally; the existing acceptance flow only asserts “Proposed
  change” and “Apply change”, both of which are unchanged. CI will run it after a push.
- A live model proposal was not exercised (no `GROQ_API_KEY`); the diff takes documents as input,
  so provider choice does not affect it, but the local planner was the only producer used here.
- Screen-reader announcement of the new list was not tested.

## Next step

Push `agent/interface-diff`, open a PR, and look at the panel once in the browser with a proposal
that adds/moves a component (the acceptance prompt already produces one).

## Open questions

- Should the same diff appear in the history drawer (revision vs current), which is the rest of the
  “diff viewer” limitation in `README.md`?
- Entries carry `area` and `page`; they could become links or hover targets on the canvas instead
  of text only.
