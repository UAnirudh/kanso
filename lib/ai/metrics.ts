import type { AiUsageMetrics } from "../repo/ai";
import { dailyTokenCap } from "./budget";

/**
 * Read-only view of AI spend and proposal quality. Kept pure — the route supplies
 * the aggregates — so the arithmetic is testable without a server or a database.
 */
export interface AiMetricsView {
  window: { days: number; since: string };
  spend: { today: number; cap: number | null; remaining: number | null };
  proposals: {
    total: number;
    /** applied + discarded + failed: proposals the user actually decided on. */
    resolved: number;
    /** Applied and not followed by another request inside the retry window. */
    accepted: number;
    applied: number;
    retried: number;
    pending: number;
    discarded: number;
    failed: number;
    acceptanceRate: number | null;
    retryWindowSeconds: number;
  };
  latencyMs: { p50: number | null; p95: number | null; samples: number };
  timeToFirstPersonalizationMs: { p50: number | null; samples: number };
  tokens: { total: number; perProposal: number | null; perAppliedChange: number | null };
}

/** Nearest-rank percentile on an ascending array. */
function percentile(sorted: number[], percent: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))] ?? null;
}

export function buildAiMetrics(input: {
  usage: AiUsageMetrics;
  tokensUsedToday: number;
  days: number;
  since: string;
  retryWindowMs: number;
}): AiMetricsView {
  const { usage } = input;
  const cap = dailyTokenCap();
  const totalTokens = usage.tokensIn + usage.tokensOut;

  // PRD §8's rate is about proposals that got a decision. A preview still sitting
  // in the panel is not a rejection, so pending rows stay out of the denominator,
  // and an applied proposal the user immediately re-asked about counts as a retry.
  const resolved = usage.applied + usage.discarded + usage.failed;
  const accepted = Math.max(0, usage.applied - usage.retriedApplied);

  return {
    window: { days: input.days, since: input.since },
    spend: {
      // Deliberately global: this is the budget that can start refusing requests,
      // so it is not the same scope as the per-workspace proposal numbers below.
      today: input.tokensUsedToday,
      cap,
      remaining: cap === null ? null : Math.max(0, cap - input.tokensUsedToday),
    },
    proposals: {
      total: usage.total,
      resolved,
      accepted,
      applied: usage.applied,
      retried: usage.retriedApplied,
      pending: usage.proposed,
      discarded: usage.discarded,
      failed: usage.failed,
      acceptanceRate: resolved === 0 ? null : Number((accepted / resolved).toFixed(3)),
      retryWindowSeconds: Math.round(input.retryWindowMs / 1000),
    },
    latencyMs: {
      p50: percentile(usage.latencies, 50),
      p95: percentile(usage.latencies, 95),
      samples: usage.latencies.length,
    },
    timeToFirstPersonalizationMs: {
      p50: percentile(usage.firstPersonalizationMs, 50),
      samples: usage.firstPersonalizationMs.length,
    },
    tokens: {
      total: totalTokens,
      perProposal: usage.total === 0 ? null : Math.round(totalTokens / usage.total),
      perAppliedChange: usage.applied === 0 ? null : Math.round(totalTokens / usage.applied),
    },
  };
}
