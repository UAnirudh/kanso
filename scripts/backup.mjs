/**
 * Writes a consistent snapshot of the running SQLite database.
 *
 *   npm run db:backup                       → .data/backups/kanso-<timestamp>.db
 *   node scripts/backup.mjs --out <file>    → an explicit path
 *
 * `VACUUM INTO` reads through WAL, so this is safe while the app is serving and
 * needs no downtime. The copy is opened again and checked before the script reports
 * success: a backup that cannot prove `PRAGMA integrity_check = ok` is not a backup.
 * The source is never created or modified; a missing database is an error.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
let requestedOut = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--out") {
    requestedOut = args[index + 1];
    index += 1;
    if (!requestedOut) fail("--out needs a path.");
  } else {
    fail(`Unknown argument: ${args[index]}`);
  }
}

const configured = process.env.DATABASE_PATH?.trim() || ".data/kanso.db";
const source = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
if (!fs.existsSync(source)) {
  fail(`${source} does not exist; there is nothing to back up.`);
}

const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "").replace(/[:T]/g, "-");
const target = requestedOut
  ? path.resolve(requestedOut)
  : path.join(path.dirname(source), "backups", `kanso-${timestamp}.db`);

if (fs.existsSync(target)) {
  fail(`${target} already exists; refusing to overwrite a backup.`);
}
fs.mkdirSync(path.dirname(target), { recursive: true });

let sourceDb;
try {
  sourceDb = new Database(source, { fileMustExist: true });
  // A writer holding the lock should make this wait briefly, not fail the backup.
  sourceDb.pragma("busy_timeout = 5000");

  const migrations = sourceDb
    .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
    .get().count;
  sourceDb.prepare("VACUUM INTO ?").run(target);
  sourceDb.close();
  sourceDb = undefined;

  const copy = new Database(target, { readonly: true, fileMustExist: true });
  try {
    const integrity = copy.prepare("PRAGMA integrity_check").get().integrity_check;
    if (integrity !== "ok") throw new Error(`integrity_check returned ${integrity}`);

    const copiedMigrations = copy
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get().count;
    if (copiedMigrations !== migrations) {
      throw new Error(
        `snapshot has ${copiedMigrations} migrations, source has ${migrations}`,
      );
    }
  } finally {
    copy.close();
  }

  const bytes = fs.statSync(target).size;
  console.log(`✓ ${target} (${bytes} bytes, ${migrations} migration(s))`);
  console.log("✓ integrity_check ok");
} catch (error) {
  try {
    sourceDb?.close();
  } catch {
    // Closing a failed connection is best-effort.
  }
  // Never leave a half-written snapshot that looks usable.
  fs.rmSync(target, { force: true });
  fail(error instanceof Error ? error.message : String(error));
}
