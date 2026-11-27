# First push to `main` under the main-only trigger: green (T-007)

- Date: 2026-11-26
- Agent: codebuff
- Task: T-007
- Branch: `agent/ci-main-push-verified` (this entry; the run itself was on `main`)

## Goal

Close the one gap left in `2026-11-26-ci-main-only-push.md`, which recorded
`push: branches: [main]` as untested until the next merge.

## What happened

- PR #3 was squash-merged into `main` as `1cbe8b7` at 08:15:01Z, from the green head `1b50203`.
- The merge push started exactly **one** CI run — event `push`, run
  [45781571160](https://github.com/UAnirudh/kanso/actions/runs/45781571160), `completed / success`:
  - `typecheck · test · build` — success at 08:15:43Z
  - `playwright acceptance` — success at 08:16:21Z
- The same commit also carries the repo's `pages-build-deployment` run (`build`, `deploy`,
  `report-build-status`), which publishes `docs/` and is not part of `ci.yml`.

## Verified

- Workflow runs for head `1cbe8b7` on `main` → two: this CI run and the Pages deployment. Only one
  of them is `ci.yml`.
- Check runs for `1cbe8b7` → five, of which exactly the two CI jobs belong to `ci.yml`; both
  `success`.
- `git log --oneline origin/main` → `1cbe8b7 Application lifecycle controls and thumb-sized touch
  targets (#3)` on `2b2b826`, with no merge commits, so the history stayed linear.

## Not verified

- One sample, not a trend: no second push to `main` has exercised the trigger yet.
- The Docker, model-key and `npm audit` rows of the verification ladder are still outside CI.
- Nothing was run locally for this entry; it records CI output that was already fetched.

## Next step

Nothing for T-007. The next merge to `main` is the second observation of the trigger.
