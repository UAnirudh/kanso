import { loadAiMetrics } from "@/lib/ai/metrics-query";
import { json, withApi } from "@/lib/api";
import { requireApiGuest } from "@/lib/identity";

export const dynamic = "force-dynamic";

/**
 * Read-only AI metrics: what the assistant cost and how often its proposals were
 * accepted. Proposal numbers are scoped to the workspaces this browser belongs to;
 * spend is global because `AI_DAILY_TOKEN_CAP` is what can start refusing requests.
 *
 * No mutation, so no same-origin check and no Zod body — this route only reads.
 * The window and scope live in `loadAiMetrics`, shared with the metrics page.
 */
export async function GET() {
  return withApi(async () => {
    const guest = await requireApiGuest();
    return json(loadAiMetrics(guest.id));
  });
}
