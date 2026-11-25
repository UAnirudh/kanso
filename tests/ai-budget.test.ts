import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppAccess } from "@/lib/repo/apps";

/**
 * The spend cap has to survive the thing the per-user window cannot: a new cookie.
 * These tests run against a real migrated SQLite file and pin the daily sum, the
 * fail-closed boundary, and the fact that the refusal happens before the provider
 * is reached.
 */

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanso-budget-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

let db: typeof import("@/lib/db");
let ai: typeof import("@/lib/repo/ai");
let budget: typeof import("@/lib/ai/budget");
let appId: string;
let userId: string;

beforeAll(async () => {
  db = await import("@/lib/db");
  ai = await import("@/lib/repo/ai");
  budget = await import("@/lib/ai/budget");
  const guests = await import("@/lib/repo/guests");
  const workspaces = await import("@/lib/repo/workspaces");

  const guest = guests.resolveGuest("f".repeat(32));
  userId = guest.id;
  appId = db.newId("app");
  db.getDb()
    .prepare(
      `INSERT INTO apps (id, workspace_id, name, description, template, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(appId, workspaces.ensureSharedWorkspace(), "Budget", "", "project", userId, db.nowIso());
});

afterEach(() => {
  delete process.env.AI_DAILY_TOKEN_CAP;
  delete process.env.GROQ_API_KEY;
  vi.unstubAllGlobals();
});

afterAll(() => {
  db.getDb().close();
  fs.rmSync(directory, { recursive: true, force: true });
});

function record(input: { tokensIn?: number | null; tokensOut?: number | null; at?: Date }): string {
  const id = ai.insertAiRequest({
    appId,
    userId,
    prompt: "budget fixture",
    provider: "groq",
    model: "test-model",
    status: "failed",
    tokensIn: input.tokensIn ?? null,
    tokensOut: input.tokensOut ?? null,
  });
  if (input.at) {
    db.getDb()
      .prepare("UPDATE ai_requests SET created_at = ? WHERE id = ?")
      .run(input.at.toISOString(), id);
  }
  return id;
}

describe("global daily AI token cap", () => {
  it("sums only today's tokens and treats missing usage as zero", () => {
    record({ tokensIn: 120, tokensOut: 80 });
    record({ tokensIn: null, tokensOut: null }); // a local-planner row costs nothing
    record({ tokensIn: 5_000, tokensOut: 5_000, at: new Date(Date.now() - 30 * 60 * 60 * 1000) });

    expect(ai.aiTokensUsedToday()).toBe(200);
  });

  it("fails closed exactly at the cap and allows one token below it", () => {
    process.env.AI_DAILY_TOKEN_CAP = "201";
    expect(() => budget.assertDailyTokenBudget()).not.toThrow();

    process.env.AI_DAILY_TOKEN_CAP = "200";
    let status: number | undefined;
    try {
      budget.assertDailyTokenBudget();
    } catch (error) {
      status = (error as { status?: number }).status;
    }
    expect(status).toBe(503);
  });

  it("reads the day's spend through the created_at index", () => {
    // Without this index the cap would scan the whole audit table on every
    // proposal; the query plan is the only thing that proves the migration works.
    const plan = db
      .getDb()
      .prepare(
        `EXPLAIN QUERY PLAN
         SELECT COALESCE(SUM(COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)), 0) AS total
           FROM ai_requests
          WHERE created_at >= ?`,
      )
      .all(new Date().toISOString()) as Array<{ detail: string }>;

    expect(plan.map((step) => step.detail).join(" ")).toContain("idx_ai_requests_created_at");
  });

  it("is off when the variable is unset, zero or not a number", () => {
    expect(budget.dailyTokenCap()).toBeNull();
    for (const value of ["", "0", "-5", "lots"]) {
      process.env.AI_DAILY_TOKEN_CAP = value;
      expect(budget.dailyTokenCap()).toBeNull();
      expect(() => budget.assertDailyTokenBudget()).not.toThrow();
    }
  });

  it("refuses before the provider is reached", async () => {
    process.env.AI_DAILY_TOKEN_CAP = "200";
    process.env.GROQ_API_KEY = "test-key-never-used";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const pipeline = await import("@/lib/ai/pipeline");
    await expect(
      pipeline.proposeInterfaceChange({
        // The refusal must land before access is resolved, so an empty stub is enough
        // and accidentally proves the ordering.
        access: {} as AppAccess,
        userId,
        prompt: "switch to dark mode",
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
