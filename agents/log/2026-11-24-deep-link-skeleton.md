# Deep-link skeleton: not reproducible, `loading.tsx` removed

- Date: 2026-11-24
- Agent: Codebuff (Buffy)
- Task: T-001
- Branch: `agent/agent-docs`

## Goal

Fix T-001 — a hard load or refresh of `/apps/[appId]` supposedly sticking on the
`loading.tsx` skeleton — and start from a measurement rather than one of the two
candidate fixes.

## Changed

- `app/apps/[appId]/loading.tsx` — **deleted**. A route-level loading boundary flushes the shell
  before the page's access check runs, so a missing app answered `200` with a 404 screen. It was
  also the only boundary that could strand a hard load on a skeleton.
- `AGENTS.md` — invariant 11 restated with the measured reason instead of a pointer to an open bug;
  "last reviewed" moved to 2026-11-24.
- `README.md` — dropped the "access boundary returns a 404 screen with HTTP 200" known limitation,
  which no longer holds, and added the agent-contract pointer.
- `agents/tasks.md` — T-001 marked done.

## Verified

Reproduction attempts on `next dev` (port 3100, fresh `.data/fix.db`) and on a real production
build (`npm run build` + `next start`, port 3201 and then a clean port 3399):

- Headless Chromium generated `app_bb46f792eb2a4b1fa76d` from the dashboard form.
- Hard load and cold load of `/apps/<id>`: workspace rendered, `document.querySelectorAll(".skeleton").length === 0`,
  no console errors. Dev: 111 ms. Prod: reload 289 ms, cold load 430 ms.
- Six back-to-back hard loads: 6/6 workspace.
- Reload fired while a client navigation was in flight: the reload simply landed on `/dashboard`
  (the click had not committed) — not a bug; an earlier "failure" here was a false positive from
  checking only for the task-board node.
- 404 path **before** the change: `/apps/app_doesnotexist123` → HTTP `200`, 8890 bytes, real
  "This application isn't available" UI, no skeleton.
- 404 path **after** the change, clean server on 3399: same URL → HTTP `404`.
- After the change the real app still renders: client navigation 415 ms, reload 163 ms, cold load
  348 ms, zero skeletons, **zero console errors**.
- `npm run build` → exit 0 both with and without `loading.tsx`.
- `npm run typecheck` → exit 0. `npm test` → 37/37 passed.
- `npm run test:e2e` → 2/2 passed (39.8 s), including "interface persistence across re-navigation"
  and the identity/role-boundary spec, so nothing in the acceptance suite depended on the deleted
  skeleton.

Not a reproduction anywhere of the reported symptom: client navigation, reload, cold load, double
reload and the 404 path all behaved correctly on HEAD before the change.

## Not verified

- The original report cannot be reproduced retrospectively, so the exact trigger that produced it is
  unknown. The most likely candidates are the pre-`41fd3db` sign-in build, or a shell flushed before
  a `notFound()` that had no boundary to land in.
- ~~The in-app skeleton that used to show during navigation is gone.~~ Superseded by the
  follow-up below: the skeleton was restored as a `Suspense` boundary inside the page.
- The fallback was confirmed to render in the streamed shell, but not measured under a throttled
  network profile; on a local SQLite build it is a frame or two, so a slow-network check is the
  only way to see it at length.

## Follow-up (2026-11-24, same task): skeleton restored as an in-page Suspense

The transitional skeleton was wanted back, so it returned in the one place that cannot lie about the
status code.

- `components/workspace/WorkspaceSkeleton.tsx` — new. The exact markup of the deleted
  `loading.tsx`, now a plain component.
- `app/apps/[appId]/page.tsx` — `requireGuest` + `requireAppAccess` + `notFound` still run at the
  top of the route, then the page returns `<Suspense fallback={<WorkspaceSkeleton />}>` around a
  `WorkspaceScreen` server component that does the reads. The boundary is below the access check,
  so access failures never flush a shell.
- `AGENTS.md` — invariant 11 reworded from "no route-level `loading.tsx`" (which read as "no
  skeleton at all") to "never route-level; in-page Suspense below the access check", plus the file
  map entry for the page.

Checked after the change: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e`,
and a real hard refresh of `/apps/<id>` in a browser against a production build — workspace
rendered, `404` still returned for an unknown id.

## Next step

Nothing outstanding for T-001.

## Open questions

None.
