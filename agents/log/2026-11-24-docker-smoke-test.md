# Docker smoke test committed as the engine test

- Date: 2026-11-24
- Agent: Codebuff (Buffy)
- Task: T-003
- Branch: `main`

## Goal

T-003 was an open question, not a bug: `docker/smoke-test.sh` passed but sat untracked, so the
README's "verified: the Docker image build … survived a restart" claim rested on a script no clone
contained. Decide it and commit it.

## Changed

- `docker/smoke-test.sh` — **committed** as-is (no content change; it had been passing untracked
  since the Docker session). It is the only end-to-end check of the shipped image: engine check →
  clean slate → build → run against a named volume → health → guest identity writes through the app
  → row-count comparison → `docker restart` → re-resolve the same guest → list the volume.
- `agents/tasks.md` — T-003 set to `done` with a link here; T-005 added for the dependency
  advisories noticed during the build (AGENTS.md §9.3: add a row, do not fix in passing).
- `agents/log/README.md` — index row.
- `AGENTS.md` §3 already documents `bash docker/smoke-test.sh`, so no rule changed.

Why commit rather than delete: every deploy claim in `README.md` is about the image and the volume,
and this is the only test that exercises the entrypoint, the unprivileged user, and persistence
together. It is slow (~90 s warm, minutes cold) and needs Docker, which is why it stays a manual
step in the AGENTS.md verification ladder rather than a gate.

## Verified

Re-ran on `0e412cf` (the commit with the restored in-page Suspense), so the result covers current
`main`, not the older tree the script was written against:

- `bash docker/smoke-test.sh` → **exit 0**, final line
  `PASS: image built, served /api/health, and kept its data across a restart.`
- Engine: server 29.9.3, `linux/aarch64`. Build stage: `npm ci` 143 packages, `next build`
  compiled in 5.6 s, 5/5 static pages, `/apps/[appId]` 40.6 kB / 147 kB first load.
- Published port 3211 (requested 3211, not remapped); `/api/health` → 200 after **2 s** cold start.
- Server process runs as `kanso` (uid 999), not root.
- `/api/device` → 307 with a 32-hex device id; `/dashboard` → 200 as that device.
- Rows before requests `{users:1, workspaces:0, workspace_members:0, apps:0, app_records:0,
  schema_migrations:3}` → after `{users:2, workspaces:1, workspace_members:2, apps:0,
  app_records:0, schema_migrations:3}`; delta `{users:+1, workspaces:+1, workspace_members:+2}`.
  (`users:1` on the empty database is the migration-seeded `usr_shared_owner`, ADR-10.)
- After `docker restart`: health 200 in 2 s, same guest `/dashboard` → 200, row counts identical.
- Volume listing: `kanso.db` 180224 bytes, owned `kanso:kanso`, with `-shm`/`-wal` present.
- Left nothing running: `docker rm -f kanso-test && docker volume rm kanso-data`.

## Not verified

- **amd64 / Render.** The local image is arm64; Render builds amd64. This passing says nothing about
  a Render build, exactly as `AGENTS.md` §8 warns.
- No `GROQ_API_KEY` in the container, so the assistant ran on the deterministic planner. The AI
  request path was not exercised inside the image; only its absence was.
- The script's failure branches (`fail()` paths, port-remap guard, ownership guard) were not
  triggered — they are only as good as this one passing run.

## Next step

T-002: `origin/main` now carries the `npm ci` fix, so open the Render dashboard, apply the Blueprint
with `GROQ_API_KEY` blank, and confirm `/api/health` plus one generated workspace on the deployed
origin. That is a human action; nothing in the repo blocks it.

## Open questions

- The build stage reports 7 advisories (2 critical, 3 high) from `npm ci`, and 4 (3 high) after
  `npm prune --omit=dev`. Triage is filed as T-005; no dependency was changed here.
