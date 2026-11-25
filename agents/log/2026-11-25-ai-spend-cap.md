# Global daily AI token cap (T-008)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-008
- Branch: `agent/ai-spend-cap`

## Goal

AI spend had no ceiling that survived a new cookie. `consumeAiBudget` is keyed by `userId`, and
identity is an httpOnly cookie minted on demand, so a loop of fresh cookies was an unbounded charge
on the owner's Groq balance once the app has a public URL. Add a global cap that fails closed before
the provider is called, and pin it with tests.

## Changed

- `lib/repo/ai.ts` — `aiTokensUsedToday(now?)` sums `COALESCE(tokens_in,0) + COALESCE(tokens_out,0)`
  for rows with `created_at >=` 00:00 UTC. Failed attempts count because the provider still bills
  them; local-planner rows contribute zero. `created_at` is a UTC ISO string, so the comparison is a
  plain lexicographic one.
- `lib/ai/budget.ts` (new) — `dailyTokenCap()` reads `AI_DAILY_TOKEN_CAP` and treats empty, zero,
  negative or non-numeric as "off"; `assertDailyTokenBudget()` throws `HttpError(503)` when today's
  recorded tokens have reached the cap.
- `lib/ai/pipeline.ts` — `providerInfo()` moved above `loadInterface`, and the assertion runs before
  the provider for a `model` provider only. The local planner costs nothing, so a key-less
  deployment is never blocked. Refusal happens before the document is loaded, so it writes no
  interface change and no `ai_requests` row (same shape as the existing per-minute refusal).
- `tests/ai-budget.test.ts` (new) — four tests against a real migrated SQLite file: the daily sum
  ignores yesterday and null usage; the boundary refuses at the cap and allows one token below; the
  variable is off when unset/zero/negative/non-numeric; the pipeline refuses **before** `fetch` is
  ever called (the access object is a deliberate stub, which also pins the ordering).
- `.env.example`, `README.md`, `render.yaml`, `PRD.md` — document the variable. Render sets
  `AI_DAILY_TOKEN_CAP=200000`.
- `agents/tasks.md` — T-008 resolved; T-014 (metrics), T-015 (CI blind spots) and T-016 (security
  headers) filed with first steps.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → exit 0, **41/41 in 5 files** (identity 5, local-planner 6, engine 18, validation 8,
  ai-budget 4), 0.89 s.
- `npx --yes js-yaml render.yaml` → exit 0.

## Not verified

- The cap against a **real** Groq key: no key in this environment, so the 503 is proven by the
  pipeline test with a stubbed `fetch`, not by a live request.
- `200000` tokens/day is a chosen default, not a measured one. It is roughly a few hundred edits;
  nobody has watched a real day's usage yet.
- The cap is in tokens, not currency, so a model change silently changes its cost.

## Next step

Deploy with the Render blueprint (T-002) and watch `SUM(tokens_in + tokens_out)` for a day; adjust
`AI_DAILY_TOKEN_CAP` from that measurement. T-014 (a metrics endpoint) would make this a number you
can read instead of a query.

## Open questions

- Should the refusal be 503 (server-side, try later) or 429 (client-side)? 503 was chosen because the
  condition is a server budget, not the caller's rate; it is easy to change in `lib/ai/budget.ts`.
- Should a refused request be audited in `ai_requests` with `status = 'failed'`? The per-minute
  refusal does not write one either, so this kept them consistent.
