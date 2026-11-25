import { getDb, newId, nowIso } from "../db";

export type AiStatus = "proposed" | "applied" | "discarded" | "failed";

export interface AiRequestRecord {
  id: string;
  appId: string;
  userId: string;
  prompt: string;
  provider: string;
  model: string;
  status: AiStatus;
  summary: string;
  message: string;
  operations: unknown[];
  warnings: string[];
  proposedDocument: string | null;
  baseDocument: string | null;
  error: string | null;
  latencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

interface AiRequestRow {
  id: string;
  app_id: string;
  user_id: string;
  prompt: string;
  provider: string;
  model: string;
  status: AiStatus;
  summary: string;
  message: string;
  operations: string;
  warnings: string;
  proposed_document: string | null;
  base_document: string | null;
  error: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  created_at: string;
}

function safeArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapRow(row: AiRequestRow): AiRequestRecord {
  return {
    id: row.id,
    appId: row.app_id,
    userId: row.user_id,
    prompt: row.prompt,
    provider: row.provider,
    model: row.model,
    status: row.status,
    summary: row.summary,
    message: row.message,
    operations: safeArray(row.operations),
    warnings: safeArray(row.warnings).map(String),
    proposedDocument: row.proposed_document,
    baseDocument: row.base_document,
    error: row.error,
    latencyMs: row.latency_ms,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: row.created_at,
  };
}

export function insertAiRequest(input: {
  appId: string;
  userId: string;
  prompt: string;
  provider: string;
  model: string;
  status: AiStatus;
  summary?: string;
  message?: string;
  operations?: unknown[];
  warnings?: string[];
  proposedDocument?: string | null;
  baseDocument?: string | null;
  error?: string | null;
  latencyMs?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}): string {
  const id = newId("air");
  getDb()
    .prepare(
      `INSERT INTO ai_requests
        (id, app_id, user_id, prompt, provider, model, status, summary, message, operations,
         warnings, proposed_document, base_document, error, latency_ms, tokens_in, tokens_out, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.appId,
      input.userId,
      input.prompt,
      input.provider,
      input.model,
      input.status,
      input.summary ?? "",
      input.message ?? "",
      JSON.stringify(input.operations ?? []),
      JSON.stringify(input.warnings ?? []),
      input.proposedDocument ?? null,
      input.baseDocument ?? null,
      input.error ?? null,
      input.latencyMs ?? null,
      input.tokensIn ?? null,
      input.tokensOut ?? null,
      nowIso(),
    );
  return id;
}

export function getAiRequest(id: string): AiRequestRecord | null {
  const row = getDb().prepare("SELECT * FROM ai_requests WHERE id = ?").get(id) as
    | AiRequestRow
    | undefined;
  return row ? mapRow(row) : null;
}

export function setAiRequestStatus(
  id: string,
  status: AiStatus,
  error?: string | null,
): void {
  getDb()
    .prepare("UPDATE ai_requests SET status = ?, error = ? WHERE id = ?")
    .run(status, error ?? null, id);
}

export function listAiRequests(appId: string, userId: string, limit = 12) {
  const rows = getDb()
    .prepare(
      "SELECT * FROM ai_requests WHERE app_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT ?",
    )
    .all(appId, userId, limit) as AiRequestRow[];
  return rows.map((row) => {
    const full = mapRow(row);
    return {
      id: full.id,
      prompt: full.prompt,
      status: full.status,
      summary: full.summary,
      error: full.error,
      createdAt: full.createdAt,
    };
  });
}

/**
 * Total model tokens recorded since 00:00 UTC, across every app and user.
 *
 * Failed attempts count: the provider still bills them, and `insertAiRequest`
 * records the tokens captured before the failure. Local-planner rows add zero.
 * `created_at` is a UTC ISO string, so a lexicographic comparison is a date one.
 */
export function aiTokensUsedToday(now = new Date()): number {
  const startOfDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)), 0) AS total
         FROM ai_requests
        WHERE created_at >= ?`,
    )
    .get(startOfDay) as { total: number } | undefined;
  return Number(row?.total ?? 0);
}

export interface AiUsageMetrics {
  total: number;
  proposed: number;
  applied: number;
  discarded: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  /** Ascending, so a percentile is an index rather than a sort in the caller. */
  latencies: number[];
  /** Applied proposals the same user re-asked about within `AI_RETRY_WINDOW_MS`. */
  retriedApplied: number;
  /** Ascending ms from a browser's first open of an app to its first assistant change. */
  firstPersonalizationMs: number[];
}

/**
 * A proposal applied and then followed by another request from the same user for the
 * same app inside this window counts as a retry, not an acceptance. PRD §8 measures
 * "applied without retry"; ten minutes is short enough that an unrelated follow-up
 * usually falls outside it, and long enough to catch "that was not what I meant".
 */
export const AI_RETRY_WINDOW_MS = 10 * 60 * 1000;

/**
 * AI usage for the apps this user can see, over a time window.
 *
 * The join through `workspace_members` is the scope: a guest sees the shared
 * workspace they belong to plus any private workspace they own, never another
 * workspace's prompts or spend. Percentiles are computed by the caller; SQLite has
 * no built-in aggregate for them.
 */
export function aiUsageMetrics(
  userId: string,
  sinceIso: string,
  retryWindowMs = AI_RETRY_WINDOW_MS,
): AiUsageMetrics {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ai.status AS status,
              COUNT(*) AS count,
              COALESCE(SUM(COALESCE(ai.tokens_in, 0)), 0) AS tokens_in,
              COALESCE(SUM(COALESCE(ai.tokens_out, 0)), 0) AS tokens_out
         FROM ai_requests ai
         JOIN apps a ON a.id = ai.app_id
         JOIN workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = ?
        WHERE ai.created_at >= ?
        GROUP BY ai.status`,
    )
    .all(userId, sinceIso) as Array<{
    status: AiStatus;
    count: number;
    tokens_in: number;
    tokens_out: number;
  }>;

  const latencies = (
    db
      .prepare(
        `SELECT ai.latency_ms AS latency
           FROM ai_requests ai
           JOIN apps a ON a.id = ai.app_id
           JOIN workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = ?
          WHERE ai.created_at >= ? AND ai.latency_ms IS NOT NULL
          ORDER BY ai.latency_ms ASC`,
      )
      .all(userId, sinceIso) as Array<{ latency: number }>
  ).map((row) => row.latency);

  // A retry is "applied, then asked again". LEAD is the next proposal for the same
  // user and app, whatever its status: a second preview the user did not apply is
  // still evidence the first change did not land. The window is computed in SQL so
  // the 30-day row set never has to travel to Node to be compared pairwise.
  const retried = db
    .prepare(
      `WITH scoped AS (
         SELECT ai.status AS status,
                ai.created_at AS created_at,
                LEAD(ai.created_at) OVER (
                  PARTITION BY ai.app_id, ai.user_id ORDER BY ai.created_at
                ) AS next_created_at
           FROM ai_requests ai
           JOIN apps a ON a.id = ai.app_id
           JOIN workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = ?
          WHERE ai.created_at >= ?
       )
       SELECT COUNT(*) AS count
         FROM scoped
        WHERE status = 'applied'
          AND next_created_at IS NOT NULL
          AND (julianday(next_created_at) - julianday(created_at)) * 86400000 <= ?`,
    )
    .get(userId, sinceIso, retryWindowMs) as { count: number } | undefined;

  // PRD §8's "time to first personalization". The baseline is the `init` revision
  // this browser got when it first opened the app, not `apps.created_at`: in a
  // shared workspace the app can be days old before this person ever sees it. The
  // end is the first `kind = 'ai'` revision, i.e. when the assistant's change
  // actually landed. Pairs whose first assistant revision predates the window are
  // not reported as if they happened inside it.
  const firsts = db
    .prepare(
      `WITH opens AS (
         SELECT r.app_id AS app_id, MIN(r.created_at) AS opened_at
           FROM interface_revisions r
          WHERE r.user_id = ? AND r.kind = 'init'
          GROUP BY r.app_id
       ),
       firsts AS (
         SELECT r.app_id AS app_id, MIN(r.created_at) AS first_at
           FROM interface_revisions r
          WHERE r.user_id = ? AND r.kind = 'ai'
          GROUP BY r.app_id
       )
       SELECT o.opened_at AS opened_at, f.first_at AS first_at
         FROM firsts f
         JOIN opens o ON o.app_id = f.app_id
         JOIN apps a ON a.id = f.app_id
         JOIN workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = ?
        WHERE f.first_at >= ?`,
    )
    .all(userId, userId, userId, sinceIso) as Array<{ opened_at: string; first_at: string }>;

  const firstPersonalizationMs = firsts
    .map((row) => Date.parse(row.first_at) - Date.parse(row.opened_at))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);

  const byStatus = (status: AiStatus) =>
    rows.find((row) => row.status === status)?.count ?? 0;

  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    proposed: byStatus("proposed"),
    applied: byStatus("applied"),
    discarded: byStatus("discarded"),
    failed: byStatus("failed"),
    tokensIn: rows.reduce((sum, row) => sum + row.tokens_in, 0),
    tokensOut: rows.reduce((sum, row) => sum + row.tokens_out, 0),
    latencies,
    retriedApplied: Number(retried?.count ?? 0),
    firstPersonalizationMs,
  };
}

/**
 * Sliding-window budget so one browser cannot exhaust the shared model quota.
 * Backed by SQLite; a production deployment would use Redis for the same call.
 */
export function consumeAiBudget(userId: string, limitPerMinute: number): boolean {
  const db = getDb();
  const bucket = `ai:${userId}`;
  const since = Date.now() - 60_000;
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM rate_limit_events WHERE bucket = ? AND created_at >= ?")
    .get(bucket, since) as { count: number };

  if (row.count >= limitPerMinute) return false;
  db.prepare("INSERT INTO rate_limit_events (bucket, created_at) VALUES (?, ?)").run(
    bucket,
    Date.now(),
  );
  db.prepare("DELETE FROM rate_limit_events WHERE created_at < ?").run(since - 60_000);
  return true;
}
