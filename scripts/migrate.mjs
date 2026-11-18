/**
 * Applies pending SQL migrations without starting the web server.
 *   npm run db:migrate
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

const files = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

let count = 0;
for (const name of files) {
  if (applied.has(name)) continue;
  const sql = fs
    .readFileSync(path.join(dir, name), "utf8")
    .replace(/^\s*(BEGIN|COMMIT);\s*$/gim, "");
  db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
      name,
      new Date().toISOString(),
    );
  })();
  count += 1;
  console.log(`✓ applied ${name}`);
}

console.log(`${file}: ${count} migration(s) applied, ${applied.size + count} total.`);
db.close();
