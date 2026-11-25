# CI gate, part 2: the first green run, then the Playwright acceptance job (T-007)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-007
- Branch: `main`

## Goal

Close the loop the 2026-11-25 CI entry left open: push `62eaae6`, read the first real `verify`
run, then add the Playwright acceptance suite to the gate so API status codes and role boundaries
are checked on every push instead of by hand (AGENTS.md §7 already requires them for API / repo /
role changes).

## Changed

- `.github/workflows/ci.yml` — added a second job, `e2e` (`playwright acceptance`), running in
  parallel with `verify` on Node 22: `npm ci` → `npx playwright install --with-deps chromium` →
  `npm run test:e2e`. `timeout-minutes: 25`. On failure it uploads `test-results/` (trace and
  screenshot are `retain-on-failure` / `only-on-failure` in `playwright.config.ts`) as an artifact
  for 7 days. The header comment now says what the two jobs are for.
- `AGENTS.md` §7 — the CI sentence now names both jobs and says a green run still does not cover
  the Docker, model-key and `npm audit` checks.
- `agents/tasks.md` — T-007 row updated with the resolution and the run link.
- `agents/log/README.md` — index row for this entry.

### Why a second job rather than two more steps

The browser download and the `--with-deps` apt step are the slowest part of the workflow. Keeping
them in `verify` would delay the typecheck/test/build signal that every change depends on. Both
jobs install dependencies independently; at this size that is cheaper and simpler than passing a
cache or an artifact between jobs.

The suite needs no service container: `playwright.config.ts` starts its own server on :3100 via
`npm run e2e:server`, which resets the database and deletes `.next` before `next dev`. The config
passes `GROQ_API_KEY: ""`, so the assistant runs the labelled local planner.

## Verified

- Push: `45958e4..62eaae6 main -> main`; `git rev-list --left-right --count origin/main...main`
  → `0 0`.
- First `verify` run,
  [45565312284](https://github.com/UAnirudh/kanso/actions/runs/45565312284), head `62eaae6`,
  event `push`: **completed / success** in 50 s (created 07:04:32Z, completed 07:05:23Z). Step
  timings: `npm ci` 8 s, `npm run typecheck` 4 s, `npm test` 1 s, `npm run build` 23 s.
- `npm run test:e2e` locally (no key, Node 24.22.3, browsers already installed) → **exit 0,
  2 passed (51.4 s)**: the acceptance scenario 31.9 s, identity/health/role boundaries 2.8 s.
- `npx --yes js-yaml .github/workflows/ci.yml` → exit 0, two jobs (`verify`, `e2e`) with the
  expected steps.

## Not verified

- **The `e2e` job has never run on a runner.** It is committed locally but not pushed, and the
  runner is where `--with-deps`, the browser download and dev-server startup on :3100 are actually
  exercised. The local suite passing proves the test code is green, not that the job works.
- CI runtime for the suite. Local 51 s here; a 2-core `ubuntu-latest` compiling routes on first
  request will be slower. Per-test timeout is 120 s and the job timeout is 25 min, so there is
  headroom, but there is no measurement.
- `pull_request` is still not a trigger, so a change is only gated after it lands on `main`.
- Still outside the gate: `bash docker/smoke-test.sh`, `npm audit`, the AI provider check, lint
  (there is no lint script) and the visual/axe spec (T-012).

## Next step

Push this commit and confirm the `e2e` job goes green; that run is the real verification of the
second job. After that, T-008 (global AI token cap) is the smallest remaining risk removal.

## Open questions

- Should `pull_request` become a trigger? Today a broken branch reaches `main` before any check
  runs, which is the opposite of a gate. It was left out because the original ask was "on every
  push".
- T-002's row is still stale about `@types/node 22.10.2` (fixed by `45958e4`) and is still owned
  by the human.
