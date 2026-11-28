# All five CI gates required on main

- Date: 2026-11-28
- Agent: codebuff
- Task: T-022
- Branch: `agent/required-deploy-checks`

## Goal

`main`'s classic protection required `typecheck · test · build` and `playwright acceptance` only.
The `migrations`, `docker` and `audit` jobs added in T-015 reported on every pull request but were
advisory, so a broken Docker image, a migration that fails on top of existing data, or a
high-severity advisory could reach `main` as long as verify and e2e passed. AGENTS.md §7 said to make
them required once they had stayed green across a few changes; they have run green on every pull
request since #9. This session makes all five required and proves the protection actually changed.

## Changed

- Branch protection on `main` (repository settings, not a tracked file): required status checks now
  list five contexts, each pinned to `app_id: 15368` (GitHub Actions) — the two existing ones plus
  `schema upgrade from previous release`, `docker build · volume smoke` and `npm audit (high)`.
  `strict` stays `false` and `enforce_admins` stays `true`; force pushes and deletions stay blocked.
  The three new names are the jobs' `name:` fields in `.github/workflows/ci.yml`, verified against
  real check runs rather than the workflow job ids (`migrations`, `docker`, `audit`).
- `AGENTS.md` §7 — the "not required yet" sentence is replaced by the five required contexts and
  what a red one now blocks. This is the only file change besides the task board and log.
- `agents/tasks.md` — T-022 row. `agents/log/README.md` — index row. This entry.

## Verified

- Before: `GET /repos/UAnirudh/kanso/branches/main` → `contexts: ["typecheck · test · build",
  "playwright acceptance"]`, both `app_id: 15368`.
- Update through the required-status-checks endpoint with all five checks and `strict: false` → the
  response echoes the five contexts with app 15368 each.
- After, three independent reads agree — `GET .../branches/main`, `GET
  .../branches/main/protection/required_status_checks` and `GET .../branches/main/protection`:
  five contexts, `app_id: 15368` each, `strict: false`, `enforce_admins.enabled: true`,
  `allow_force_pushes.enabled: false`, `allow_deletions.enabled: false`. `GET
  /rules/branches/main` returns `rules: []`, so classic protection is the only layer and nothing
  else re-adds or removes a check.
- All five contexts exist and were `success` on `main`'s head `ae262ec` (push run
  [46048481062](https://github.com/UAnirudh/kanso/actions/runs/46048481062)); the names were read
  from those check runs, and `schema upgrade from previous release` was confirmed by name through a
  filtered check-run query, so a typo cannot leave the gate permanently unsatisfiable.
- PR [#22](https://github.com/UAnirudh/kanso/pull/22) (this change) run
  [46124457594](https://github.com/UAnirudh/kanso/actions/runs/46124457594) on `3f078af`, attempt 1
  → all five green: `typecheck · test · build` 45 s (job 08:09:13→08:09:58), `playwright acceptance`
  115 s (container init 31 s, tests 65 s), `schema upgrade from previous release` 10 s,
  `docker build · volume smoke` 83 s (smoke script 69 s), `npm audit (high)` 14 s.
- Behavioural proof of the gate: while that run was in flight the PR read `mergeable: true` but
  `mergeable_state: blocked`; after the five checks completed it became `mergeable_state: clean`.
  A required context whose name did not match a real check would have left it blocked, so the
  blocked → clean transition also proves the five strings line up with the reported check runs.

## Not verified

- No pull request was deliberately broken to watch a Docker, migration or audit failure refuse the
  merge. That needs a failing image or migration, and the API read-back plus the blocked → clean
  transition cover the wiring without spending a deliberately red run.
- Nothing was run locally: no code changed, so there was no `typecheck`, `npm test`, `build` or
  `test:e2e` to run. The only local checks were `git diff` (three files, 8 insertions, 5 deletions)
  and reading the updated §7 paragraph.

## Next step

Merge PR #22. The protection change itself is already live and does not depend on that merge.

## Open questions

- (none)
