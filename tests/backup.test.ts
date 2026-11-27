import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";

/**
 * A backup is only useful if it opens. These tests build a real migrated database,
 * insert a row, run the same script an operator runs, and check the snapshot's
 * integrity, schema history and data rather than just the exit code.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-backup-"));
const source = path.join(directory, "source.db");
const env = { ...process.env, DATABASE_PATH: source };

function run(script: string, args: string[] = [], overrides: NodeJS.ProcessEnv = env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: overrides,
    encoding: "utf8",
  });
}

afterAll(() => {
  // Windows can hold a closed SQLite handle for a moment; retry instead of failing
  // the suite on temp-directory cleanup.
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("database backup", () => {
  it("writes an integrity-checked snapshot with the same data and schema history", () => {
    const migrated = run("scripts/migrate.mjs");
    expect(migrated.status, migrated.stderr).toBe(0);

    // Migration 0003 replaced accounts with device identities, so the row that
    // matters here is a guest (a unique device_id), not an email.
    const db = new Database(source);
    let sourceRows: number;
    let sourceMigrations: number;
    try {
      db.prepare(
        "INSERT INTO users (id, name, created_at, device_id, is_system) VALUES (?, ?, ?, ?, 0)",
      ).run(
        "usr_backup_test",
        "Backup Test",
        new Date().toISOString(),
        "a".repeat(32),
      );
      sourceRows = (
        db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }
      ).count;
      sourceMigrations = (
        db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as { count: number }
      ).count;
    } finally {
      db.close();
    }

    const target = path.join(directory, "snapshot.db");
    const backup = run("scripts/backup.mjs", ["--out", target]);
    expect(backup.status, backup.stderr).toBe(0);
    expect(backup.stdout).toContain("integrity_check ok");
    expect(fs.existsSync(target)).toBe(true);

    const copy = new Database(target, { readonly: true });
    try {
      expect(
        (copy.prepare("PRAGMA integrity_check").get() as { integrity_check: string })
          .integrity_check,
      ).toBe("ok");
      expect(
        (copy.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count,
      ).toBe(sourceRows);
      expect(
        (
          copy.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get() as {
            count: number;
          }
        ).count,
      ).toBe(sourceMigrations);
      expect(
        (
          copy
            .prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'usr_backup_test'")
            .get() as { count: number }
        ).count,
      ).toBe(1);
    } finally {
      copy.close();
    }
  });

  it("refuses a missing source instead of creating an empty database", () => {
    const missing = path.join(directory, "does-not-exist.db");
    const target = path.join(directory, "never.db");

    const result = run("scripts/backup.mjs", ["--out", target], {
      ...process.env,
      DATABASE_PATH: missing,
    });

    expect(result.status).not.toBe(0);
    expect(fs.existsSync(missing)).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
  });

  it("refuses to overwrite an existing file, including the source itself", () => {
    const result = run("scripts/backup.mjs", ["--out", source]);
    expect(result.status).not.toBe(0);

    const stillThere = new Database(source, { readonly: true });
    try {
      expect(
        (stillThere.prepare("PRAGMA integrity_check").get() as { integrity_check: string })
          .integrity_check,
      ).toBe("ok");
    } finally {
      stillThere.close();
    }
  });
});
