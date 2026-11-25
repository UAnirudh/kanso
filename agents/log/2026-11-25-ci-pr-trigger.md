# CI gate, part 3: e2e green on the runner, pull requests gated (T-007)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-007
- Branch: `main`

## Goal

Confirm the new `e2e` job works on GitHub's runner rather than only on this machine, then make
both jobs run for pull requests so a branch is checked before merge instead of only after it
reaches `main`.

## Changed

- `.github/workflows/ci.yml` — `pull_request:` added alongside `push:`. No paths or branch
  filters, so every PR (and every push to a branch) runs `verify` and `e2e`.
- `AGENTS.md` §7 — the CI sentence now says "on every push and pull request".
- `agents/tasks.md` — T-007 row records the green `e2e` run and the new trigger, and is `done`.
- `agents/log/README.md` — index row for this entry.

## Verified

- Push: `62eaae6..18017db main -> main`; `git rev-list --left-right --count origin/main...main`
  → `0 0`.
- Run [45567404178](https://github.com/UAnirudh/kanso/actions/runs/45567404178), head `18017db`,
  event `push`: **completed / success** in 73 s (07:20:46Z → 07:21:59Z), both jobs on
  `ubuntu-latest`.
  - `playwright acceptance` — success, 71 s. `npm ci` 5 s, `npx playwright install --with-deps
    chromium` 24 s, `npm run test:e2e` 34 s. The `upload-artifact` step is `if: failure()` and
    reported `skipped`, which is the expected shape of a green run.
  - `typecheck · test · build` — success, 49 s (build 25 s).
- The suite is faster on the runner (34 s of tests) than locally (51 s), so the 120 s per-test
  timeout and the 25 min job timeout have wide margin.

## Not verified

- **No `pull_request` event has ever run.** The trigger only takes effect for PRs opened after
  this file lands on the default branch, and opening a throwaway PR to observe it is a repository
  write the human did not ask for. The next real PR is the first test of that event.
- **The PR jobs are not required checks.** GitHub runs them, but nothing blocks a merge while
  they are red until a branch protection rule (or a ruleset) marks `typecheck · test · build` and
  `playwright acceptance` as required on the default branch. That is a repository setting, not a
  file in this repo, and it is the human's call.
- First-time fork contributors need maintainer approval before their PR workflow runs (GitHub's
  default), so a fork PR may sit in "waiting" rather than start immediately.
- Still outside the gate: `bash docker/smoke-test.sh`, `npm audit`, the AI provider check, lint
  (no lint script) and the visual/axe spec (T-012).

## Next step

The gate is done. Open the next PR normally and confirm the `pull_request` run appears; if you
want merges actually blocked, add both job names as required checks in Settings → Branches.

## Open questions

- Branch protection: should `typecheck · test · build` and `playwright acceptance` be required on
  `main`? Without it the PR job is advisory.
- T-002's row is still stale about `@types/node 22.10.2` (fixed by `45958e4`) and is still owned
  by the human.
