import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const PROJECT_ROOT = process.cwd();

export function databasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim() || ".data/kanso.db";
  return path.isAbsolute(configured)
    ? configured
    : path.join(PROJECT_ROOT, configured);
}

type GlobalWithDb = typeof globalThis & {
  __kansoDb?: Database.Database;
};

const globalWithDb = globalThis as GlobalWithDb;

function applyMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name       TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     );`,
  );

  const dir = path.join(PROJECT_ROOT, "migrations");
  if (!fs.existsSync(dir)) return;

  const applied = new Set(
    db
      .prepare<[], { name: string }>("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name),
  );

  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    // The runner owns the transaction; migration files stay declarative.
    const sql = fs
      .readFileSync(path.join(dir, file), "utf8")
      .replace(/^\s*(BEGIN|COMMIT);\s*$/gim, "");
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    run();
  }
}

export function getDb(): Database.Database {
  if (globalWithDb.__kansoDb) return globalWithDb.__kansoDb;

  const file = databasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  applyMigrations(db);
  globalWithDb.__kansoDb = db;
  return db;
}

/** Wraps a unit of work in a SQLite transaction. */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const wrapped = db.transaction(fn);
  return wrapped(db);
}

export function newId(prefix: string): string {
  const random = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
