import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AiUsageMetrics } from "@/lib/repo/ai";

/**
 * The metrics endpoint is the only place the PRD's success criteria become
 * numbers, so the arithmetic and the scope are pinned here: statuses, the
 * window, the membership join, percentiles, the PRD §8 acceptance rule
 * (applied without retry over decided proposals) and time to first
 * personalization.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-metrics-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let ai: typeof import("@/lib/repo/ai");
let metrics: typeof import("@/lib/ai/metrics");
let appId: string;
let userId: string;
let workspaceId: string;

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** Default fixtures march 30 minutes apart, comfortably outside the 10-minute retry window. */
let sequence = 0;
const base = Date.now() - 12 * 60 * 60 * 1000;

beforeAll(async () => {
  db = await import("@/lib/db");
  ai = await import("@/lib/repo/ai");
  metrics = await import("@/lib/ai/metrics");
  const guests = await import("@/lib/repo/guests");
  const workspaces = await import("@/lib/repo/workspaces");

  const guest = guests.resolveGuest("c".repeat(32));
  userId = guest.id;
  workspaceId = workspaces.ensureSharedWorkspace();
  appId = db.newId("app");
  insertApp(appId, Date.now());
});

afterEach(() => {
  delete process.env.AI_DAILY_TOKEN_CAP;
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function insertApp(id: string, createdAtMs: number): void {
  db.getDb()
    .prepare(
      `INSERT INTO apps (id, workspace_id, name, description, template, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      workspaceId,
      "Metrics",
      "",
      "project",
      userId,
      new Date(createdAtMs).toISOString(),
    );
}

/** A revision row is enough here: the metric reads `kind` and `created_at` only. */
function addRevision(app: string, kind: string, atMs: number): void {
  const existing = db
    .getDb()
    .prepare("SELECT id FROM user_interfaces WHERE app_id = ? AND user_id = ?")
    .get(app, userId) as { id: string } | undefined;
  const interfaceId = existing?.id ?? db.newId("ui");
  if (!existing) {
    db.getDb()
      .prepare(
        `INSERT INTO user_interfaces (id, app_id, user_id, document, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(interfaceId, app, userId, "{}", new Date(atMs).toISOString());
  }
  db.getDb()
    .prepare(
      `INSERT INTO interface_revisions
         (id, user_interface_id, app_id, user_id, kind, label, document, operations, ai_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      db.newId("rev"),
      interfaceId,
      app,
      userId,
      kind,
      "test",
      "{}",
      "[]",
      null,
      new Date(atMs).toISOString(),
    );
}

function record(input: {
  status: "proposed" | "applied" | "discarded" | "failed";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  at?: number;
}): void {
  const id = ai.insertAiRequest({
    appId,
    userId,
    prompt: "metrics fixture",
    provider: "groq",
    model: "test-model",
    status: input.status,
    tokensIn: input.tokensIn,
    tokensOut: input.tokensOut,
    latencyMs: input.latencyMs,
  });
  const at = input.at ?? base + sequence++ * 30 * MINUTE_MS;
  db.getDb()
    .prepare("UPDATE ai_requests SET created_at = ? WHERE id = ?")
    .run(new Date(at).toISOString(), id);
}

describe("AI metrics", () => {
  it("groups statuses, sums tokens and keeps only the window", () => {
    record({ status: "applied", tokensIn: 400, tokensOut: 200, latencyMs: 500 });
    record({ status: "applied", tokensIn: 300, tokensOut: 100, latencyMs: 700 });
    record({ status: "failed", tokensIn: 50, tokensOut: 0, latencyMs: 900 });
    record({ status: "proposed", tokensIn: 100, tokensOut: 30, latencyMs: 1_100 });
    record({ status: "discarded", tokensIn: 0, tokensOut: 0, latencyMs: 1_300 });
    // Older than the 30-day window the endpoint asks for.
    record({
      status: "applied",
      tokensIn: 9_000,
      tokensOut: 9_000,
      latencyMs: 5_000,
      at: Date.now() - 40 * DAY_MS,
    });

    const usage = ai.aiUsageMetrics(userId, new Date(Date.now() - 30 * DAY_MS).toISOString());
    expect(usage).toMatchObject({
      total: 5,
      applied: 2,
      failed: 1,
      proposed: 1,
      discarded: 1,
      tokensIn: 850,
      tokensOut: 330,
      retriedApplied: 0,
    });
    expect(usage.latencies).toEqual([500, 700, 900, 1_100, 1_300]);
    expect(usage.firstPersonalizationMs).toEqual([]);
  });

  it("counts an applied proposal as retried when the same browser asks again inside the window", () => {
    const appliedAt = Date.now() - 20 * 60 * MINUTE_MS;
    record({ status: "applied", tokensIn: 0, tokensOut: 0, latencyMs: 100, at: appliedAt });
    // "That was not what I meant" two minutes later: the previous apply was a retry.
    record({
      status: "proposed",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 100,
      at: appliedAt + 2 * MINUTE_MS,
    });
    // A later apply with nothing after it inside the window is a clean acceptance.
    record({
      status: "applied",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 100,
      at: appliedAt + 60 * MINUTE_MS,
    });

    const usage = ai.aiUsageMetrics(userId, new Date(Date.now() - 30 * DAY_MS).toISOString());
    expect(usage.retriedApplied).toBe(1);
  });

  it("measures from this browser's first open to its first assistant change", () => {
    const now = Date.now();
    const quickApp = db.newId("app");
    insertApp(quickApp, now - 10 * MINUTE_MS);
    // `init` is the first open; a manual edit in between must not move the baseline.
    addRevision(quickApp, "init", now - 9 * MINUTE_MS);
    addRevision(quickApp, "manual", now - 8.5 * MINUTE_MS);
    addRevision(quickApp, "ai", now - 7 * MINUTE_MS); // 2 minutes

    const slowerApp = db.newId("app");
    insertApp(slowerApp, now - 30 * MINUTE_MS);
    addRevision(slowerApp, "init", now - 30 * MINUTE_MS);
    addRevision(slowerApp, "ai", now - 20 * MINUTE_MS); // 10 minutes

    // A first personalization before the window is not reported as one inside it.
    const oldApp = db.newId("app");
    insertApp(oldApp, now - 45 * DAY_MS);
    addRevision(oldApp, "init", now - 45 * DAY_MS);
    addRevision(oldApp, "ai", now - 40 * DAY_MS);

    // An assistant revision with no recorded open has no baseline and is skipped.
    const unopenedApp = db.newId("app");
    insertApp(unopenedApp, now - 5 * MINUTE_MS);
    addRevision(unopenedApp, "ai", now - 4 * MINUTE_MS);

    const usage = ai.aiUsageMetrics(userId, new Date(Date.now() - 30 * DAY_MS).toISOString());
    expect(usage.firstPersonalizationMs).toEqual([2 * MINUTE_MS, 10 * MINUTE_MS]);
  });

  it("does not leak another workspace's usage", () => {
    const stranger = ai.aiUsageMetrics("usr_not_a_member", new Date(0).toISOString());
    expect(stranger).toMatchObject({ total: 0, applied: 0, tokensIn: 0, retriedApplied: 0 });
    expect(stranger.latencies).toEqual([]);
    expect(stranger.firstPersonalizationMs).toEqual([]);
  });

  it("turns the aggregates into a PRD rate, percentiles and per-change tokens", () => {
    process.env.AI_DAILY_TOKEN_CAP = "5000";
    const usage: AiUsageMetrics = {
      total: 6,
      proposed: 1,
      applied: 3,
      discarded: 1,
      failed: 1,
      tokensIn: 1_000,
      tokensOut: 1_000,
      latencies: [100, 200, 300, 400],
      retriedApplied: 1,
      firstPersonalizationMs: [2_000, 4_000, 60_000],
    };

    const view = metrics.buildAiMetrics({
      usage,
      tokensUsedToday: 1_000,
      days: 30,
      since: "2026-10-26T00:00:00.000Z",
      retryWindowMs: 10 * 60 * 1000,
    });

    // Pending is not a decision: 5 decided, 2 applied without a retry.
    expect(view.proposals).toMatchObject({
      total: 6,
      resolved: 5,
      accepted: 2,
      applied: 3,
      retried: 1,
      pending: 1,
      discarded: 1,
      failed: 1,
      acceptanceRate: 0.4,
      retryWindowSeconds: 600,
    });
    expect(view.latencyMs).toEqual({ p50: 200, p95: 400, samples: 4 });
    expect(view.timeToFirstPersonalizationMs).toEqual({ p50: 4_000, samples: 3 });
    expect(view.tokens).toEqual({ total: 2_000, perProposal: 333, perAppliedChange: 667 });
    expect(view.spend).toEqual({ today: 1_000, cap: 5_000, remaining: 4_000 });
  });

  it("reports null rather than zero when there is nothing to divide by", () => {
    const empty = metrics.buildAiMetrics({
      usage: {
        total: 0,
        proposed: 0,
        applied: 0,
        discarded: 0,
        failed: 0,
        tokensIn: 0,
        tokensOut: 0,
        latencies: [],
        retriedApplied: 0,
        firstPersonalizationMs: [],
      },
      tokensUsedToday: 0,
      days: 30,
      since: "2026-10-26T00:00:00.000Z",
      retryWindowMs: 10 * 60 * 1000,
    });

    expect(empty.proposals).toMatchObject({
      resolved: 0,
      accepted: 0,
      acceptanceRate: null,
      retryWindowSeconds: 600,
    });
    expect(empty.latencyMs).toEqual({ p50: null, p95: null, samples: 0 });
    expect(empty.timeToFirstPersonalizationMs).toEqual({ p50: null, samples: 0 });
    expect(empty.tokens).toEqual({ total: 0, perProposal: null, perAppliedChange: null });
    expect(empty.spend.cap).toBeNull();
    expect(empty.spend.remaining).toBeNull();
  });
});
