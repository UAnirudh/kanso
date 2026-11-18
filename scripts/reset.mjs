/**
 * Deletes the local SQLite database. The app recreates the schema on next boot.
 *   npm run db:reset
 * Destructive by design — development only.
 */
import fs from "node:fs";
import path from "node:path";

const configured = process.env.DATABASE_PATH?.trim() || ".data/kanso.db";
const file = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log(`Removed ${target}`);
  }
}
console.log("Database removed. The schema is rebuilt on the next request.");
