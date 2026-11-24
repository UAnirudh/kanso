# Docker image, volume persistence, Render review

- Date: 2026-11-20
- Agent: Buffy (Freebuff)
- Task: T-002
- Branch: `main` (commit `003dde6`, unpushed)

## Goal
Prove the production image starts and keeps data across a restart with a mounted volume, check the
local checkout has `Dockerfile` / `render.yaml` / `docker/entrypoint.sh`, and review `render.yaml`
before the human clicks Apply on Render.

## Changed
- No application code. `package.json` / `package-lock.json` were already fixed in `003dde6`
  (`@types/node` `22.10.2` → `^22.12.0`, lockfile regenerated) after `npm ci` failed inside
  `node:22-bookworm-slim` with `EUSAGE … Missing: @types/node@26.6.6 from lock file`; vite 7 (via
  vitest 3.2.4) needs `>=22.12.0` and npm 10.9 rejects the old pin.

## Verified
- `bash docker/smoke-test.sh` → exit 0 on Docker 29.9.3 / linux-aarch64.
- Build: multi-stage image builds, `next build` type-check passes inside it.
- Run: `3211 → 3000`, `/api/health` → 200 in 4 s; server runs as `kanso` (uid 999) as PID 1.
- Writes: guest flow produced `users 1→2, workspaces 0→1, workspace_members 0→2` on the volume.
- `docker restart` → health 200 in 4 s, same `kanso_device` cookie still gets `/dashboard` 200, row
  counts identical before/after; volume holds `kanso.db` 180224 B + `-wal`/`-shm` owned `kanso:kanso`.
- Render port simulation: `docker run -e PORT=10000` binds `0.0.0.0:10000` (listener `00000000:2710`),
  `/api/health` → 200 on :10000, and the image `HEALTHCHECK` follows `process.env.PORT`.
- `render.yaml` schema review: `autoDeployTrigger: commit` (valid enum `off|commit|checksPass`),
  `plan: 0.5c-512mb` (valid, Render's default, paid so a disk is allowed), `dockerfilePath` +
  `dockerContext` correct, `DATABASE_PATH` matches `mountPath: /var/data`, `healthCheckPath` hits a
  route that only needs `SELECT 1`, `GROQ_API_KEY` is `sync: false` and optional at boot.

## Not verified
- The Render deployment itself, and an amd64 build: local image is arm64, Render builds amd64. The
  Dockerfile has no arch assumptions and compiles `better-sqlite3` in the `deps` stage.
- A live Groq completion (no key on this machine) — the assistant runs on the labelled local planner.
- Vitest and Playwright suites were not re-run in that session; the Docker flow was tested over HTTP.

## Next step
The Render build will fail until `003dde6` is pushed: `origin/main` still pins `@types/node 22.10.2`,
so `npm ci` fails in the image. After the push, apply the Blueprint with `GROQ_API_KEY` blank.

## Open questions
- Push `main` now, and should `docker/smoke-test.sh` (untracked) go in the same push? (T-003)
