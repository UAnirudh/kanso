# PRD acceptance semantics and time to first personalization (T-018)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-018
- Branch: `agent/metrics-semantics`

## Goal

The metrics page reported "applied ÷ all generated", so a preview still waiting for a decision
pulled the rate down, and PRD §8's "applied without retry" was not actually measured. The PRD's
first success metric, time to first personalization, was not measured at all.

## Changed

- `lib/repo/ai.ts` —
  - `AI_RETRY_WINDOW_MS = 10 min`, exported with the rule.
  - `aiUsageMetrics(userId, sinceIso, retryWindowMs)` now also returns `retriedApplied`: applied
    proposals followed by another proposal from the same user for the same app inside the window,
    computed with `LEAD(...) OVER (PARTITION BY app_id, user_id ORDER BY created_at)` so the row set
    never has to come to Node for pairwise comparison.
  - `firstPersonalizationMs`: per app, the first `kind = 'ai'` revision minus the first
    `kind = 'init'` revision. Ascending, in ms. Pairs with no `init` row or whose first assistant
    revision predates the window are excluded.
- `lib/ai/metrics.ts` — `proposals` now carries `resolved` (applied + discarded + failed),
  `accepted` (applied − retried), `retried`, `retryWindowSeconds`; `acceptanceRate` is
  `accepted / resolved`, `null` when nothing was decided. New
  `timeToFirstPersonalizationMs: { p50, samples }` using the existing nearest-rank percentile.
- `lib/ai/metrics-query.ts` — passes the retry window through `loadAiMetrics`, so the page and the
  JSON route keep one definition.
- `app/metrics/page.tsx` — acceptance card reads "accepted of resolved, no re-ask within N min";
  the proposals card says pending is not counted; a new "Time to first personalization" section
  with median, samples and the PRD's 90 s target; the outcomes copy explains the denominator and an
  applied-proposal retry note appears when `retried > 0`.
- `tests/metrics.test.ts` — 6 tests now: the window/status/token fixture also asserts
  `retriedApplied: 0`; a retry pair (`applied`, then another request 2 minutes later) counts as one
  retry; first personalization matches init→ai deltas, ignores manual edits, skips an assistant
  revision with no open, and excludes a first change older than the window; the pure view test pins
  `resolved/accepted/retried/rate` and the p50; the empty case pins nulls.
- `README.md` — the Metrics section describes both new definitions.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → exit 0, **48/48 in 6 files**.
- Live dev server (`:3400`, local planner, `.data/kanso.db`):
  - `GET /api/metrics` returns `proposals: { total, resolved, accepted, applied, retried, pending,
    discarded, failed, acceptanceRate, retryWindowSeconds }` and
    `timeToFirstPersonalizationMs`.
  - A fresh device, then propose → apply: `resolved: 1, accepted: 1, retried: 0,
    acceptanceRate: 1`, `timeToFirstPersonalizationMs: { p50: 539, samples: 1 }`.
  - Earlier workspace rows by other devices keep counting in `proposals` (workspace scope) while
    `timeToFirstPersonalizationMs` stays per browser, as designed.
  - `/metrics` HTML contains "Time to first personalization", "PRD target", "decided, no re-ask"
    and "not counted in the rate".

## Not verified

- The 10-minute retry heuristic against real usage: no real users, and the local planner makes
  "that was not what I meant" artificial.
- The page was not viewed in a browser; layout of the new section is unverified.
- No e2e asserts the page or the new JSON fields.
- A browser that applies an assistant change without ever receiving an `init` revision (possible
  only through direct API calls) contributes no timing sample — deliberate, but untested against a
  real client.

## Next step

After a real key and a real session, read `/metrics` once: check that `retried` is low for
legitimate follow-ups and that `timeToFirstPersonalizationMs.p50` is under 90 s. If unrelated
follow-ups inside 10 minutes inflate `retried`, the window is `AI_RETRY_WINDOW_MS` in
`lib/repo/ai.ts`.

## Open questions

- Should `tokens.perAppliedChange` divide by accepted changes rather than all applied ones? PRD
  §8 says "cost per applied change", so it still divides by every applied row, retries included.
- Should retry also require the second request to target the same page or operation? Today any
  request for the same app counts, which is stricter and easier to explain.
