import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { AiUsageMetrics } from "@/lib/repo/ai";

/**
 * The metrics endpoint is the only place the PRD's success criteria become
 * numbers, so the arithmetic and the scope are pinned here: statuses, the
 * window, the membership join, percentiles and the acceptance denominator.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-metrics-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let ai: typeof import("@/lib/repo/ai");
let metrics: typeof import("@/lib/ai/metrics");
let appId: string;
let userId: string;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  db = await import("@/lib/db");
  ai = await import("@/lib/repo/ai");
  metrics = await import("@/lib/ai/metrics");
  const guests = await import("@/lib/repo/guests");
  const workspaces = await import("@/lib/repo/workspaces");

  const guest = guests.resolveGuest("c".repeat(32));
  userId = guest.id;
  appId = db.newId("app");
  db.getDb()
    .prepare(
      `INSERT INTO apps (id, workspace_id, name, description, template, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(appId, workspaces.ensureSharedWorkspace(), "Metrics", "", "project", userId, db.nowIso());
});

afterEach(() => {
  delete process.env.AI_DAILY_TOKEN_CAP;
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function record(input: {
  status: "proposed" | "applied" | "discarded" | "failed";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  daysAgo?: number;
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
  if (input.daysAgo) {
    db.getDb()
      .prepare("UPDATE ai_requests SET created_at = ? WHERE id = ?")
      .run(new Date(Date.now() - input.daysAgo * DAY_MS).toISOString(), id);
  }
}

describe("AI metrics", () => {
  it("groups statuses, sums tokens and keeps only the window", () => {
    record({ status: "applied", tokensIn: 400, tokensOut: 200, latencyMs: 500 });
    record({ status: "applied", tokensIn: 300, tokensOut: 100, latencyMs: 700 });
    record({ status: "failed", tokensIn: 50, tokensOut: 0, latencyMs: 900 });
    record({ status: "proposed", tokensIn: 100, tokensOut: 30, latencyMs: 1_100 });
    record({ status: "discarded", tokensIn: 0, tokensOut: 0, latencyMs: 1_300 });
    // Older than the 30-day window the endpoint asks for.
    record({ status: "applied", tokensIn: 9_000, tokensOut: 9_000, latencyMs: 5_000, daysAgo: 40 });

    const usage = ai.aiUsageMetrics(userId, new Date(Date.now() - 30 * DAY_MS).toISOString());
    expect(usage).toMatchObject({
      total: 5,
      applied: 2,
      failed: 1,
      proposed: 1,
      discarded: 1,
      tokensIn: 850,
      tokensOut: 330,
    });
    expect(usage.latencies).toEqual([500, 700, 900, 1_100, 1_300]);
  });

  it("does not leak another workspace's usage", () => {
    const stranger = ai.aiUsageMetrics("usr_not_a_member", new Date(0).toISOString());
    expect(stranger).toMatchObject({ total: 0, applied: 0, tokensIn: 0, tokensOut: 0 });
    expect(stranger.latencies).toEqual([]);
  });

  it("turns the aggregates into a rate, percentiles and per-change tokens", () => {
    process.env.AI_DAILY_TOKEN_CAP = "5000";
    const usage: AiUsageMetrics = {
      total: 4,
      proposed: 1,
      applied: 2,
      discarded: 1,
      failed: 0,
      tokensIn: 1_000,
      tokensOut: 1_000,
      latencies: [100, 200, 300, 400],
    };

    const view = metrics.buildAiMetrics({
      usage,
      tokensUsedToday: 1_000,
      days: 30,
      since: "2026-10-26T00:00:00.000Z",
    });

    expect(view.proposals.acceptanceRate).toBe(0.5);
    expect(view.latencyMs).toEqual({ p50: 200, p95: 400, samples: 4 });
    expect(view.tokens).toEqual({ total: 2_000, perProposal: 500, perAppliedChange: 1_000 });
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
      },
      tokensUsedToday: 0,
      days: 30,
      since: "2026-10-26T00:00:00.000Z",
    });

    expect(empty.proposals.acceptanceRate).toBeNull();
    expect(empty.latencyMs).toEqual({ p50: null, p95: null, samples: 0 });
    expect(empty.tokens).toEqual({ total: 0, perProposal: null, perAppliedChange: null });
    expect(empty.spend.cap).toBeNull();
    expect(empty.spend.remaining).toBeNull();
  });
});
