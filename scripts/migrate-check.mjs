/**
 * Proves a release's migrations apply to a database that already holds the previous
 * schema — the deploy failure a fresh-database test cannot see.
 *
 *   1. Build a database at the second-to-last migration using the real runner (`--until`).
 *   2. Run the runner again, so the newest file applies on top of that schema.
 *   3. Check `PRAGMA foreign_key_check` and `integrity_check`, that every file is
 *      recorded, and that the pending migration's index exists (currently the
 *      `0004_ai_requests_created_at` index, which is the newest file on disk).
 *
 * Run locally with `node scripts/migrate-check.mjs`; CI runs the same command.
 * The temporary database lives under the OS temp dir and is removed even on failure.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const runner = fileURLToPath(new URL("./migrate.mjs", import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-migrate-"));
const file = path.join(directory, "upgrade.db");

// Always build at the second-to-last file, so "previous release" stays true as
// migrations are appended instead of pinning the check to one version.
const migrationsDirectory = path.join(process.cwd(), "migrations");
const allMigrations = fs
  .readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort();
if (allMigrations.length < 2) {
  console.error("FAIL: need at least two migrations to test an upgrade.");
  process.exit(1);
}
const pendingMigration = allMigrations[allMigrations.length - 1];
const baselineUntil = allMigrations[allMigrations.length - 2].replace(/\.sql$/, "");
const expectedBaseline = allMigrations.length - 1;
const expectedUpgraded = allMigrations.length;

function fail(message) {
  console.error(`FAIL: ${message}`);
  cleanup();
  process.exit(1);
}

function cleanup() {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // A locked WAL file on Windows is harmless for a temp directory.
  }
}

function migrate(args, label) {
  const result = spawnSync(process.execPath, [runner, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: file },
    stdio: "inherit",
  });
  if (result.status !== 0) fail(`${label} exited with ${result.status ?? "no status"}`);
}

function read(check) {
  const db = new Database(file, { readonly: true });
  try {
    return check(db);
  } finally {
    db.close();
  }
}

const applied = () =>
  read((db) =>
    db
      .prepare("SELECT name FROM schema_migrations ORDER BY name")
      .all()
      .map((row) => row.name),
  );

try {
  console.log(`== 1/3 baseline at ${baselineUntil} (${expectedBaseline} of ${expectedUpgraded}) ==`);
  migrate([`--until=${baselineUntil}`], "baseline migration");
  const baseline = applied();
  if (baseline.length !== expectedBaseline) {
    fail(`expected ${expectedBaseline} migrations at baseline, found ${baseline.length}`);
  }
  if (baseline.includes(pendingMigration)) fail(`${pendingMigration} was already applied`);

  console.log(`== 2/3 apply pending ${pendingMigration} on top ==`);
  migrate([], "upgrade migration");
  const upgraded = applied();
  if (upgraded.length !== expectedUpgraded) {
    fail(`expected ${expectedUpgraded} migrations after upgrade, found ${upgraded.length}`);
  }
  if (!upgraded.includes(pendingMigration)) fail(`${pendingMigration} was not recorded`);
  if (upgraded.join("\n") !== allMigrations.join("\n")) {
    fail("recorded migrations differ from the files on disk");
  }

  console.log("== 3/3 schema and referential checks ==");
  read((db) => {
    const violations = db.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) fail(`${violations.length} foreign key violation(s)`);

    const integrity = db.prepare("PRAGMA integrity_check").get();
    if (integrity.integrity_check !== "ok") fail(`integrity_check: ${integrity.integrity_check}`);

    const index = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
      .get("idx_ai_requests_created_at");
    if (!index) fail("migration 0004's idx_ai_requests_created_at is missing");
  });

  console.log(
    `PASS: a database at ${baselineUntil} upgrades to ${pendingMigration} with no foreign-key violations.`,
  );
  cleanup();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
