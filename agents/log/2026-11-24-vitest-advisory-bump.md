# Vitest 4.1.12: dev-tree advisories to zero (T-006)

- Date: 2026-11-24
- Agent: codebuff
- Task: T-006
- Branch: `main`

## Goal

Clear the last three `npm audit` findings (2 critical, 1 moderate). They reach the tree only through
the dev-only test runner: `vitest@3.2.4` → `tinypool@1.1.1` and `@vitest/mocker@3.2.4`. Nothing in
the pruned production image was affected (`npm audit --omit=dev` was already 0 after T-005); the goal
was a clean `npm audit` on the full tree without disturbing the shipped surface.

## Changed

- `package.json` / `package-lock.json` — `vitest` `3.2.4` → `4.1.12` (exact pin, matching how the
  other dev tooling is pinned). No new dependency, so AGENTS.md invariant 10 needs no ADR.
- `agents/tasks.md` — T-006 `todo` → `done` with the resolution note; T-005 row now also links this
  session's e2e entry.
- `agents/log/README.md` — index rows for this entry and for `2026-11-24-e2e-zod4-verification.md`.

Nothing under `app/`, `lib/`, `components/` or `tests/` changed — the suite passed unmodified on the
new runner.

### Why not 3.2.7

`npm audit` proposed `vitest@3.2.7` (`isSemVerMajor: false`), but that suggestion cannot work: the
underlying advisory ranges are `@vitest/mocker >=2.1.0 <4.1.11` / `<4.1.12` and `tinypool <2.1.2`,
and vitest pins `@vitest/mocker` to its own version and (in 3.x) `tinypool ^1.1.1`. Every 3.x is
inside a range, so **4.1.12** — the first release outside all of them — is the real floor. Verified
empirically rather than trusting the suggestion:

- `npm view vitest@3.2.7 dependencies` → `tinypool: ^1.1.1`, `@vitest/mocker: 3.2.7`.
- After the bump the tree resolves `vitest 4.1.12`, `@vitest/mocker 4.1.12`, `vite 8.3.8`; `tinypool`
  is no longer in the lockfile at all.

## Verified

- `npm install -D vitest@4.1.12 --save-exact` → exit 0, `added 11, removed 21, changed 12`, "found 0
  vulnerabilities".
- `npm run typecheck` → exit 0 (the `vitest/config` types still resolve).
- `npm test` → exit 0, **37/37 in 4 files** (identity 5, local-planner 6, engine 18, validation 8) in
  632 ms on v4.1.12. `vitest.config.ts` needed no change (`environment: "node"`, alias, reporters are
  all still valid in v4).
- `npm audit` → exit 0, `found 0 vulnerabilities` (full tree, was 3).
- `npm audit --omit=dev` → exit 0, `found 0 vulnerabilities` (unchanged).
- `bash docker/smoke-test.sh` → **exit 0** (`PASS: image built, served /api/health, and kept its data
  across a restart`). The image's own `npm ci` (npm 10.9 / `node:22-bookworm-slim`) audited 135
  packages with **0 vulnerabilities**, and `npm prune --omit=dev` audited 67 packages with 0 — so the
  stricter in-image installer accepts the new lockfile, which is the failure mode this repo has hit
  before. Health 200 after 2 s as `kanso` (uid 999); rows `{users:2, workspaces:1,
  workspace_members:2}` identical after `docker restart`; guest `/dashboard` 200; volume
  `kanso.db` 180224 B owned `kanso:kanso`.

## Not verified

- `npm run test:e2e` was **not** re-run after this bump. It passed 2/2 an hour earlier on `3493a7b`
  (see `2026-11-24-e2e-zod4-verification.md`); this change touches only the unit-test runner, no app
  code, so the Playwright result still stands. If a later change touches app code, run the full
  ladder.
- Render / amd64 build remains unverified locally (arm64 image here).
- Vitest 5.1.1 is the current major; deliberately not taken. 4.1.12 is the smallest version that
  clears the advisories, and a second major would be an unrelated migration.
- Note for the next bump: vitest 4 pulls `vite 8`, which wants Node 20.19+ / 22.12+. The Docker image
  and Render use `node:22-bookworm-slim`, so that is satisfied, but a pinned older Node would not be.

## Next step

T-002 is the only opening item that needs a person: apply the Render Blueprint with `GROQ_API_KEY`
blank and watch the `deps` stage for `sharp`. T-004 (recorded-transcript fixture for the AI success
path) needs a funded key.

## Open questions

None.
