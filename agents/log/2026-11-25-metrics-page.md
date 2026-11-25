# A read-only metrics page (T-017)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-017
- Branch: `agent/metrics-page`

## Goal

T-014 shipped `/api/metrics`, but reading it meant curling with a device cookie. Render the same
numbers in the app so spend against the cap, acceptance rate, p50/p95 and tokens per applied change
are one click from the dashboard.

## Changed

- `app/metrics/page.tsx` (new) — server component: `requireGuest()` then `loadAiMetrics`. Six stat
  cards (`dl` with `dt`/`dd`) plus a proposal-outcomes table with `scope` headers, an sr-only
  `caption`, correct `tfoot` totals and an empty-window hint. No client state, no chart, no
  `loading.tsx` (invariant 11 applies to dynamic routes; this page has no per-app access check).
- `lib/ai/metrics-query.ts` (new) — `loadAiMetrics(userId, days)` and `METRICS_WINDOW_DAYS = 30`.
  One definition of the window and the scope, shared by the page and the JSON route so they cannot
  drift. `lib/ai/metrics.ts` stays pure and testable.
- `app/api/metrics/route.ts` — now delegates to `loadAiMetrics`; the response shape is unchanged.
- `app/dashboard/page.tsx` — a "Metrics" pill in the header, with the bar-chart icon.
- `README.md` — the Metrics section now names the page and says both surfaces read through
  `loadAiMetrics`.

## Verified

- `npm run typecheck` → exit 0.
- `npm test` → exit 0, **46/46 in 6 files**.
- `npm run build` → exit 0; the route table lists `ƒ /metrics` (dynamic, 165 B) and `ƒ /api/metrics`.
- Dev server on `:3401` against the existing `.data/kanso.db`:
  - `/metrics` without a cookie → **307** to `/api/device`.
  - With a minted device cookie → **200**, 48,566 bytes of HTML containing "Spend today",
    "Acceptance rate", "p50 latency", "p95 latency", "Tokens per applied change", "Proposal
    outcomes" and "100%" — the earlier probe proposal (1 applied of 1) renders as 100%.
  - `/dashboard` HTML contains `href="/metrics"`.
  - `GET /api/metrics` still answers `{total:1, applied:1, acceptanceRate:1, p50:3, p95:3}` after
    the refactor.

## Not verified

- **Not looked at in a browser.** No screenshot, no responsive or keyboard/focus check; only the
  server HTML was inspected.
- `npm run test:e2e`: not run locally. The PR's required e2e job covers the existing flows, but no
  e2e asserts `/metrics` content.
- Real model spend (no `GROQ_API_KEY`), as before: `spend.today` is 0 in this environment.

## Next step

Open `/metrics` once on the deployment after real usage. If the six-card grid feels cramped on a
laptop, the layout is a single `dl` in `app/metrics/page.tsx` and the breakpoints are there.

## Open questions

- Should the page filter by application rather than the whole workspace? The repo query has no
  `app_id` filter yet; adding one would make the endpoint and page take a query parameter.
- Should acceptance exclude proposals still pending? PRD §8 says applied over generated, so pending
  currently pulls the rate down while it waits.
