import { buildAiMetrics, type AiMetricsView } from "./metrics";
import { AI_RETRY_WINDOW_MS, aiTokensUsedToday, aiUsageMetrics } from "../repo/ai";

/**
 * The one place that decides what "the metrics" mean: a 30-day proposal window
 * scoped to the caller's workspaces, plus the global daily spend. Both the JSON
 * route and the `/metrics` page read through this, so the two can never disagree
 * about the window or the scope.
 */
export const METRICS_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadAiMetrics(userId: string, days = METRICS_WINDOW_DAYS): AiMetricsView {
  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  return buildAiMetrics({
    usage: aiUsageMetrics(userId, since, AI_RETRY_WINDOW_MS),
    tokensUsedToday: aiTokensUsedToday(),
    days,
    since,
    retryWindowMs: AI_RETRY_WINDOW_MS,
  });
}
