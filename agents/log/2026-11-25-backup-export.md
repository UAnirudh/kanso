# Backup snapshots and per-app export (T-009)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-009
- Branch: `agent/db-backup` (local commits, not pushed)

## Goal

The Render disk is explicitly not a backup, records are hard-deleted, and the only copy of a
workspace was the live SQLite file. Give an operator a snapshot they can trust, document how to put
one back, and give a member a portable copy of one app's data.

## Changed

- `scripts/backup.mjs` (new) — `VACUUM INTO` a timestamped snapshot (default
  `<database dir>/backups/kanso-<UTC timestamp>.db`, or `--out <file>`). It refuses a missing source
  or an existing target, reopens the copy, requires `PRAGMA integrity_check = ok` and the same
  migration count as the source, and deletes the target on any failure. `VACUUM INTO` reads through
  WAL, so no downtime.
- `tests/backup.test.ts` (new) — builds a real migrated database, inserts a guest row, runs the same
  script, and checks the snapshot's integrity, schema history and row counts. Also pins that a
  missing source creates nothing and that an existing file (including the source) is never
  overwritten.
- `app/api/apps/[appId]/export/route.ts` (new) — `GET /api/apps/<appId>/export` returns app metadata,
  pages, tasks and notes as a JSON attachment. Access goes through `requireApiGuest` and
  `requireAppAccess`, so it is member-only; a viewer may export because they can already read the
  data. It deliberately excludes other users' interface documents and AI audit rows — that is what
  the database snapshot is for.
- `e2e/acceptance.spec.ts` — the acceptance flow now downloads the export after creating a task and
  asserts the attachment header, app id and the created task; the server-side spec asserts an
  anonymous export is `401`.
- `package.json` — `db:backup`.
- `README.md` — scripts table, backup/restore steps (including the container path), sensitive-data
  note, per-app export, and the new acceptance coverage.
- `AGENTS.md` — §3 lists `npm run db:backup`.

No migration, no new dependency, no schema change.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → 51/51 in 7 files (was 48; +3 backup tests).
- `npm run test:e2e` → 3/3 in 2.6 min:
  - acceptance flow 42.3 s (includes the export download and content assertions),
  - server-side spec 3.5 s (anonymous export `401`),
  - security headers 3.5 s (unchanged).
- `npm run build` → exit 0; `/api/apps/[appId]/export` appears as a dynamic route.
- `npm run db:backup` against the real local `.data/kanso.db` →
  `✓ .data/backups/kanso-2026-11-25-09-49-04.db (376832 bytes, 4 migration(s))`,
  `✓ integrity_check ok`. The generated directory was removed after inspection.

## Not verified

- A restore was not performed against a live service: replacing the file on the Render disk needs
  the dashboard (T-002). The documented steps are stop → replace → delete `-wal`/`-shm` → start.
- No scheduled/off-host backup exists; the script only produces the file, and someone still has to
  copy it off the host.
- Export is API-only; there is no button in the dashboard.
- Export has no import counterpart, and it does not include other members' interface documents.
- The Docker image was not rebuilt for this change. The runner image already copies `scripts/` and
  ships `better-sqlite3`, so `docker exec kanso node scripts/backup.mjs` should work, but that path
  is untested.

## Next step

Push `agent/db-backup` and open a PR. CI's existing `verify` job runs the new backup test, `e2e` runs
the export assertions, and the `docker` job rebuilds the image; the migrations job is unaffected
because there is no new migration.

## Open questions

- Should a scheduled snapshot (Render cron or entrypoint) be added, or is a manual command enough
  until Postgres?
- Should the export optionally include the caller's own interface document? It is currently the
  shared app data only, on the argument that layout is per-user and not portable.
