import { buildAiMetrics } from "@/lib/ai/metrics";
import { json, withApi } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";
import { aiTokensUsedToday, aiUsageMetrics } from "@/lib/repo/ai";

export const dynamic = "force-dynamic";

const DAYS = 30;

/**
 * Read-only AI metrics: what the assistant cost and how often its proposals were
 * accepted. Proposal numbers are scoped to the workspaces this browser belongs to;
 * spend is global because `AI_DAILY_TOKEN_CAP` is what can start refusing requests.
 *
 * No mutation, so no same-origin check and no Zod body — this route only reads.
 */
export async function GET() {
  return withApi(async () => {
    const guest = await requireApiGuest();
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    return json(
      buildAiMetrics({
        usage: aiUsageMetrics(guest.id, since),
        tokensUsedToday: aiTokensUsedToday(),
        days: DAYS,
        since,
      }),
    );
  });
}
