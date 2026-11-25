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
    applied: number;
    pending: number;
    discarded: number;
    failed: number;
    acceptanceRate: number | null;
  };
  latencyMs: { p50: number | null; p95: number | null; samples: number };
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
}): AiMetricsView {
  const { usage } = input;
  const cap = dailyTokenCap();
  const totalTokens = usage.tokensIn + usage.tokensOut;

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
      applied: usage.applied,
      pending: usage.proposed,
      discarded: usage.discarded,
      failed: usage.failed,
      // PRD §8's "applied without retry" over every generated proposal.
      acceptanceRate:
        usage.total === 0 ? null : Number((usage.applied / usage.total).toFixed(3)),
    },
    latencyMs: {
      p50: percentile(usage.latencies, 50),
      p95: percentile(usage.latencies, 95),
      samples: usage.latencies.length,
    },
    tokens: {
      total: totalTokens,
      perProposal: usage.total === 0 ? null : Math.round(totalTokens / usage.total),
      perAppliedChange: usage.applied === 0 ? null : Math.round(totalTokens / usage.applied),
    },
  };
}
