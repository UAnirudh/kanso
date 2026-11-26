# Restore drill on a throwaway copy (T-019)

- Date: 2026-11-26
- Agent: codebuff
- Task: T-019
- Branch: `agent/db-backup` (the T-009 feature branch; this record is local and unpushed)

## Goal

The restore paragraph in `README.md` had never been executed: T-009 wrote the snapshot and
documented "stop → replace the database → delete `-wal`/`-shm` → start", but nobody had put a
snapshot back. Run those steps literally against a throwaway copy, confirm the snapshot's data comes
back, and correct the docs only if a step was wrong.

## Changed

- `agents/tasks.md` — T-019 row (this drill), status `review`.
- `agents/log/README.md` — index row for this entry.
- `agents/log/2026-11-26-restore-drill.md` — this file.

No code, schema or `README.md` change: every documented step worked as written, so there was
nothing to correct.

## Verified

The whole drill ran against `.data/restore-drill/` (a throwaway directory, deleted afterwards); the
real `.data/kanso.db` was never the restore target.

1. **Throwaway copy.** `node scripts/backup.mjs --out .data/restore-drill/kanso.db` →
   `✓ ...kanso.db (376832 bytes, 4 migration(s))`, `✓ integrity_check ok`.
   The source was the live local database, which had a 319,488-byte main file and a
   671,592-byte `kanso.db-wal`: a plain file copy would have missed the committed data sitting in
   the WAL, which is why the copy was made with the backup script rather than `cp`.
2. **Baseline through the app.** `GET /api/apps/app_1cce72053fd24a6ea8ea/records` with the
   `kanso_device` cookie of an existing admin → 8 tasks, all pre-existing.
3. **Pre-snapshot write.** `POST .../records` `{"kind":"task","title":"restore-drill-before-snapshot"}`
   → `201`, `rec_37bd1b7c786f48a98b89`.
4. **Snapshot while serving.** `DATABASE_PATH=<drill>/kanso.db node scripts/backup.mjs` →
   `✓ .../backups/kanso-2026-11-26-08-17-19.db (376832 bytes, 4 migration(s))`,
   `✓ integrity_check ok`. A read-only check of the snapshot found exactly one drill row,
   `restore-drill-before-snapshot`.
5. **Post-snapshot writes.** `PATCH .../records/rec_37bd…` retitled it to
   `restore-drill-MUTATED-after-snapshot` (`200`); `POST` created
   `restore-drill-after-snapshot` (`201`). The running app then listed both changes.
6. **Stop.** The drill aborted its first restore attempt because the API still answered — stopping
   the wrapper process had left the `next dev` child serving. Killing the actual listener PIDs
   (`32528` and its child, plus the npx wrapper `516`) took `/api/health` to `http=000`. The
   abrupt stop left `kanso.db-wal` (53,592 bytes) and `kanso.db-shm` (32,768 bytes) behind: the
   stale-file situation the README's delete step exists for.
7. **README restore steps, literally.** `cp <snapshot> .data/restore-drill/kanso.db`, then
   `rm -f .data/restore-drill/kanso.db-wal .data/restore-drill/kanso.db-shm`, then start again with
   the same absolute `DATABASE_PATH`.
8. **Data came back.** After restart `GET /api/health` → `200 {"ok":true,"db":"up"}`;
   `GET .../records` → 9 tasks, the only drill row being `restore-drill-before-snapshot`. The
   post-snapshot create and the retitle were gone. `GET /apps/app_1cce…` with the same cookie →
   `200`, HTML contains the restored task and not the post-snapshot one.
9. **Restored file.** `PRAGMA integrity_check` → `ok`; `schema_migrations` → 4; 24 users and 6 apps,
   matching the snapshot.

## Not verified

- A restore against Render or the Docker container. Replacing the file on the Render disk needs the
  dashboard (T-002); the container path adds file ownership questions this local drill cannot see.
- "Migrations newer than the snapshot are applied on boot" was not exercised — there is no newer
  migration to apply. The boot and `db:migrate` runners are the same code in `lib/db.ts`, but this
  drill did not prove the upgrade path.
- No negative control: the stale `-wal` was deleted as documented, but the drill did not test what
  happens if that step is skipped.
- The snapshot was not copied off the host and no scheduled backup exists.

## Next step

Review and merge PR #10, then (once the image is rebuilt) repeat this drill inside the container and
copy the snapshot off the host at least once.

## Open questions

- Should the file swap become a small `npm run db:restore -- <snapshot>` script? It is four manual
  steps and the "stop the service" part is easy to get wrong: this drill's first attempt was refused
  by the API still answering, which is exactly the mistake that would corrupt a live database.
