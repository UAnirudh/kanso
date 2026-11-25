# Metrics endpoint and the `ai_requests(created_at)` index (T-014)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-014
- Branch: `agent/ai-metrics`

## Goal

The daily spend cap summed `ai_requests` on every proposal, and the audit rows it reads had no index
for that range. Separately, the PRD's success criteria existed only as intentions: nothing could
report what the assistant cost or how often its proposals were accepted. Add the index and a
read-only endpoint that turns those rows into numbers.

## Changed

- `migrations/0004_ai_requests_created_at.sql` (new) — `CREATE INDEX idx_ai_requests_created_at`,
  append-only. The existing `idx_ai_requests_app` leads with `app_id`, so a `created_at >=` range
  could not use it.
- `lib/repo/ai.ts` — `aiUsageMetrics(userId, sinceIso)`: status counts and token sums grouped by
  status, plus ascending `latency_ms` samples, joined through `workspace_members` so a guest only
  sees apps in workspaces they belong to. SQL stays in `lib/repo/*` (invariant 4).
- `lib/ai/metrics.ts` (new) — pure shaping: acceptance = applied ÷ every generated proposal,
  nearest-rank p50/p95, tokens per proposal and per applied change, and global spend against
  `AI_DAILY_TOKEN_CAP`. `null` rather than `0` where there is no denominator.
- `app/api/metrics/route.ts` (new) — `GET`, `force-dynamic`, `requireApiGuest` (401 signed out),
  `no-store`. Read-only, so no same-origin check and no body schema.
- `tests/metrics.test.ts` (new, 4 tests) — status grouping with a 30-day window that excludes a
  40-day-old row, the membership scope, the rate/percentile/token arithmetic, and the all-null empty
  case. `tests/ai-budget.test.ts` gained a test that `EXPLAIN QUERY PLAN` for the daily sum names
  `idx_ai_requests_created_at`.
- `README.md` — a `## Metrics` section describing the shape and the global-vs-workspace scope.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → exit 0, **46/46 in 6 files** (budget 5, metrics 4, identity 5, planner 6, engine 18,
  validation 8).
- `npm run db:migrate` → `✓ applied 0004_ai_requests_created_at.sql`, 4 total; `sqlite_master`
  lists `idx_ai_requests_created_at` on the existing `.data/kanso.db`.
- Live probe on `next dev -p 3400` with the local planner:
  - `GET /api/metrics` without a cookie → **401**.
  - With a minted device cookie → **200**, `cache-control: no-store`, `content-type:
    application/json`, zeroed shape with `null` ratios.
  - `POST /api/apps/<app>/ai` with "switch to dark mode" → 1 operation;
    metrics then `{total:1, pending:1, acceptanceRate:0, latencyMs:{p50:3,p95:3,samples:1}}`.
  - `POST .../ai/apply` → 200; metrics then `{total:1, applied:1, pending:0, acceptanceRate:1}`,
    tokens 0 because the planner is local. That is the acceptance arithmetic working end to end.

## Not verified

- Percentiles at realistic sample sizes: the probe had one sample and the tests use four.
- Real model spend: no `GROQ_API_KEY` here, so `spend.today` is 0 and `cap` is null locally.
- The index's performance effect on a large table. The plan test proves SQLite chooses it; it does
  not measure a speedup.
- Any UI: the endpoint is JSON only. There is no dashboard page reading it yet.

## Next step

Read `/api/metrics` on the deployed app after a day of real use, then tune `AI_DAILY_TOKEN_CAP`
from `spend.today` and `tokens.perAppliedChange`. T-015 (CI blind spots) and T-016 (headers) remain
open on the board.

## Open questions

- Should `/api/metrics` be owner-only once accounts exist (T-010)? Today any guest can read the
  numbers, which matches the "every guest is an admin" model but would not suit real team data.
- Is a 30-day window the right default? It is a constant in the route, not a query parameter.
