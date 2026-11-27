/**
 * Applies pending SQL migrations without starting the web server.
 *   npm run db:migrate
 *   node scripts/migrate.mjs --until=0003
 * Kept in plain Node ESM so it can run before any bundler is involved.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const configured = process.env.DATABASE_PATH?.trim() || ".data/kanso.db";
const file = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(
  `CREATE TABLE IF NOT EXISTS schema_migrations (
     name TEXT PRIMARY KEY,
     applied_at TEXT NOT NULL
   );`,
);

const dir = path.join(process.cwd(), "migrations");
const applied = new Set(
  db.prepare("SELECT name FROM schema_migrations").all().map((row) => row.name),
);

const all = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

// `--until=0003` stops after that migration. It exists for the CI upgrade check:
// build a database at the previous release with this same runner, then run it
// again to prove the pending file applies on top instead of only from empty.
const untilArg = process.argv.slice(2).find((arg) => arg.startsWith("--until="));
const until = untilArg?.slice("--until=".length).trim() || null;
let files = all;
if (until) {
  const end = all.findIndex((name) => name.startsWith(until));
  if (end === -1) {
    console.error(`No migration matches --until=${until}.`);
    process.exit(1);
  }
  files = all.slice(0, end + 1);
}

// Table rebuilds need foreign-key enforcement off (the pragma is a no-op inside a
// transaction), so it stays off for the run and every file is checked before it is
// recorded. Mirrors applyMigrations() in lib/db.ts.
db.pragma("foreign_keys = OFF");
let count = 0;
try {
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = fs
      .readFileSync(path.join(dir, name), "utf8")
      .replace(/^\s*(BEGIN|COMMIT);\s*$/gim, "");
    db.transaction(() => {
      db.exec(sql);
      const violations = db.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        throw new Error(`Migration ${name} left ${violations.length} foreign key violation(s).`);
      }
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        name,
        new Date().toISOString(),
      );
    })();
    count += 1;
    console.log(`✓ applied ${name}`);
  }
} finally {
  db.pragma("foreign_keys = ON");
}

console.log(`${file}: ${count} migration(s) applied, ${applied.size + count} total.`);
db.close();
