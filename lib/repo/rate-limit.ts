import { getDb } from "../db";

/**
 * A sliding-window counter backed by SQLite, shared by the budgets that need one
 * (AI edits, credential attempts). Each call records the attempt and prunes
 * events older than the window, so the table stays small without a sweeper.
 *
 * Returns false when the window is already full; the caller decides how to
 * present that (an HTTP 429 for APIs, a form message for server actions).
 */
export function consumeRateLimit(
  bucket: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const db = getDb();
  const since = now - windowMs;
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE bucket = ? AND created_at >= ?")
    .get(bucket, since) as { count: number };

  if (row.count >= limit) return false;

  db.prepare("INSERT INTO rate_limit_events (bucket, created_at) VALUES (?, ?)").run(bucket, now);
  db.prepare("DELETE FROM rate_limit_events WHERE created_at < ?").run(since - 60_000);
  return true;
}
