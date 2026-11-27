# Deploy gates brought up to date and green on current main

- Date: 2026-11-27
- Agent: codebuff
- Task: T-015 (finish)
- Branch: `agent/ci-deploy-gates`

## Goal

PR #9 added the three jobs T-015 asked for (`migrations`, `docker`, `audit`) on 2026-11-25, but it was
cut from `2b2b826` and never merged. By 2026-11-27 `main` had moved five merges ahead (#11 scoped
`push` to `main`, #13 added the Playwright cache, #15 added the axe suite), and the PR read
`mergeable: false`, `mergeable_state: dirty` — so the only CI coverage for the deploy failure modes
was stuck on a stale branch. This session merged current `main` into the branch, resolved the three
conflicts without dropping anything either side had added, and got all five jobs green.

## Changed

- Merge `65baf5b` (PR #14's merge, which is `main` at the time of writing) into the branch as
  `de40553`. Conflicts and how they were resolved:
  - `.github/workflows/ci.yml` — the `push` trigger block. Kept main's wording (main-only push,
    branch work gated by the pull request) and corrected it for five jobs instead of two, because
    the Docker build is now the expensive duplicate a branch push would start.
  - `AGENTS.md` §7 — kept main's Playwright-cache paragraph and its "branch push runs nothing by
    itself" sentence, and added the branch's `migrations`/`docker`/`audit` sentence. The line that
    said green CI "does not cover the Docker … and `npm audit` checks" is now only about the
    model-key check, which is the one row CI genuinely cannot run.
  - `agents/log/README.md` — both sides appended a row to the same table. Kept the branch's
    2026-11-25 row and main's four later rows, in date order.
- `scripts/migrate-check.mjs` — doc comment only. It still claimed the baseline was `0003` and that
  "all four migrations" are recorded; with `0004_accounts.sql` on main the gate actually builds at
  `0004_accounts` (4 of 5) and applies `0004_ai_requests_created_at.sql`.

## Verified

- `main` was confirmed at `65baf5b` before merging. An earlier attempt merged against a local
  `origin/main` that was stale at `5066441`; that merge was discarded (`git reset --hard 3972ec8`)
  and redone, so the merge commit's parents are `3972ec8 65baf5b`.
- `.github/workflows/ci.yml` parses as YAML; the five job ids are `verify`, `e2e`, `migrations`,
  `docker`, `audit`, and the `actions/cache` step for `~/.cache/ms-playwright` is intact.
- `node scripts/migrate-check.mjs` locally: baseline at `0004_accounts` (4 of 5), then
  `0004_ai_requests_created_at` applied on top (5 total), `foreign_key_check` empty,
  `integrity_check` ok, `idx_ai_requests_created_at` present → PASS.
- `npm audit --audit-level=high` locally → 0 vulnerabilities.
- PR #9 run [46030092877](https://github.com/UAnirudh/kanso/actions/runs/46030092877) on `de40553`
  → **success**, all five check runs, `mergeStateStatus` back to `CLEAN`:
  - `typecheck · test · build` 40 s (job 140611393157)
  - `playwright acceptance` 92 s (job 140611393103): cache 5 s, install 9 s, `test:e2e` 62 s
  - `schema upgrade from previous release` 15 s (job 140611393082): `npm ci` 8 s, migrate-check <1 s
  - `docker build · volume smoke` 92 s (job 140611393187): `bash docker/smoke-test.sh` 72 s
  - `npm audit (high)` 7 s (job 140611392844)

## Not verified

- The Docker job's log download is truncated during the image build, so the script's own output
  (`server user: kanso`, the row counts across the restart, the final `PASS:` line) was not read
  back. The step reports `success` and the script is `set -euo pipefail` with `PASS:` as its last
  line, so reaching the end means every assertion passed — but this is inference from the step
  result, not a read of those lines.
- No local Docker daemon in this workspace, so the image build and volume smoke test were only
  exercised on the amd64 runner.
- The three jobs are still not required status checks. Making them required is a deliberate next
  step, not something this session did.

## Next step

Review and merge PR #9, then watch `main`'s push run — that is the first time the five jobs run on
the deployed branch. After a few stable runs, add `schema upgrade from previous release`,
`docker build · volume smoke` and `npm audit (high)` to `main`'s required checks (T-013 describes
the current classic protection).

## Open questions

- `migrations/0004_accounts.sql` and `migrations/0004_ai_requests_created_at.sql` share a numeric
  prefix. The gate passes because `--until` receives a full filename stem and `migrate.mjs` sorts by
  filename, but AGENTS.md §4.3 says to "add the next number", and a rename would re-apply the file
  on existing volumes because `schema_migrations` records the name. Decide whether to document the
  exception or teach the runner a remap before the next migration.
