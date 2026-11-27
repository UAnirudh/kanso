# CI gates for the three deploy failures (T-015)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-015
- Branch: `agent/ci-deploy-gates`

## Goal

Green CI proved the app compiled and behaved, but not that it would deploy: the image is built by a
different npm and architecture, the smoke test is the only thing that exercises the volume and a
restart, a migration had never been applied on top of an existing schema, and a dependency CVE would
not fail anything.

## Changed

- `scripts/migrate.mjs` — accepts `--until=0003`, which stops after the named migration and exits
  non-zero if nothing matches. The default path is unchanged; this is the baseline builder for the
  upgrade check.
- `scripts/migrate-check.mjs` (new) — creates a temp database, builds it at the **second-to-last**
  migration (so "previous release" stays true as files are appended), runs the runner again to apply
  the newest file, then requires every recorded name to match the files on disk, zero
  `PRAGMA foreign_key_check` rows, `PRAGMA integrity_check = ok`, and the presence of
  `idx_ai_requests_created_at`. Removes the temp directory even on failure.
- `.github/workflows/ci.yml` — three new jobs:
  - `migrations`: `npm ci` then `node scripts/migrate-check.mjs`.
  - `docker`: `bash docker/smoke-test.sh` (build, named volume, guest write, restart, row compare),
    with an `always()` cleanup of the container and volume.
  - `audit`: `npm audit --audit-level=high` (high/critical only, so low advisories don't train
    people to bypass the gate).
- `AGENTS.md` — §3 lists the check command; §7 now says which checks CI covers and that
  `migrations`, `docker` and `audit` are reporting but not yet required status checks.
- No README change: no user-facing command, env var or deploy step moved.

## Verified

- `node scripts/migrate-check.mjs` → exit 0:
  baseline at `0003_shared_workspace_ownership` (3 of 4), then
  `0004_ai_requests_created_at.sql` applied on top, recorded names equal the files on disk,
  `foreign_key_check` 0, `integrity_check` ok, index present.
- `npm audit --audit-level=high` → exit 0, "found 0 vulnerabilities".
- Workflow YAML parses (`npx js-yaml`) with jobs `verify, e2e, migrations, docker, audit`.
- `bash docker/smoke-test.sh` → exit 0 on this machine (linux/aarch64, Docker 29.9.3): image built,
  container served `/api/health` after 2 s as uid 999 (`kanso`), wrote a guest + workspace to the
  named volume, `/dashboard` 200 for the same device after `docker restart`, row counts identical
  before and after, `schema_migrations: 4` on the volume.
- `npm run typecheck` → 0; `npm test` → 48/48 in 6 files (unchanged by script-only edits).

## Not verified

- The new jobs on the GitHub runner itself at commit time. The PR reports their first remote run;
  the scripts above are the same commands the jobs call, but the runner is amd64 and a fresh image.
- CI timing/caching: the docker job rebuilds every run (no layer cache yet), which is simpler but
  slower. Watch the first few durations before adding cache plumbing.
- The check upgrades from one previous step, which is the release a deploy actually replaces. It
  does not replay every historical starting point (0001 → newest), so a migration that only breaks
  from a much older schema would not be caught.

## Next step

Open the PR, confirm `migrations`, `docker` and `audit` are green on the runner, then decide whether
to add them to branch protection's required checks. They should be required only after they have
been stable for a couple of PRs; otherwise a flaky Docker pull blocks every merge.

## Open questions

- Should the Docker job use `docker/build-push-action` with `cache-from: type=gha`? It would cut the
  multi-minute build but adds an action and a token surface; measure first.
- Should `npm audit` also fail on moderate? Current choice is high/critical only, and the level is
  one flag in the workflow.
