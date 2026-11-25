import { HttpError } from "../errors";
import { aiTokensUsedToday } from "../repo/ai";

/**
 * Global ceiling on model tokens per UTC day, read from `AI_DAILY_TOKEN_CAP`.
 *
 * The per-user sliding window in `consumeAiBudget` cannot protect the owner's
 * provider balance: identity is an httpOnly cookie, so a new cookie is a new
 * budget. This ceiling is keyed by nothing, which is the point.
 *
 * Empty, zero or a non-number means "off", so a deployment that never sets the
 * variable behaves exactly as it did before.
 */
export function dailyTokenCap(): number | null {
  const configured = Number(process.env.AI_DAILY_TOKEN_CAP?.trim() ?? "");
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

/**
 * Fails closed once today's recorded tokens reach the cap, before the provider
 * is called. The only overshoot is the request already in flight: tokens are
 * recorded after every attempt, so the next one is refused.
 */
export function assertDailyTokenBudget(now = new Date()): void {
  const cap = dailyTokenCap();
  if (cap === null) return;
  if (aiTokensUsedToday(now) < cap) return;

  throw new HttpError(
    503,
    "The assistant has reached its daily token budget. Your interface is unchanged — try again after 00:00 UTC.",
  );
}
