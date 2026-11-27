# E2E runs in the pinned Playwright container

- Date: 2026-11-27
- Agent: codebuff
- Task: T-021
- Branch: `agent/playwright-container`

## Goal

The `e2e` job ran `npx playwright install --with-deps chromium`, which downloads Chromium and then
apt-installs the fonts and browser libraries from whichever Ubuntu mirror the runner was assigned.
That dependency failed outright on `main`'s push run
[46032513870](https://github.com/UAnirudh/kanso/actions/runs/46032513870) —
`E: Unable to locate package fonts-unifont`, `E: Package 'fonts-freefont-ttf' has no installation
candidate`, `Error: Installation process exited with code: 100` — and a slow mirror had already
stretched the same job from 2 m 02 s to 6 m 47 s on 2026-11-26. This session moves the job into the
Playwright image that matches the lockfile's browser version, so it fetches no browser and touches
no `apt` sources.

## Changed

- `.github/workflows/ci.yml` — the `e2e` job runs in
  `container: image: mcr.microsoft.com/playwright:v1.65.1-noble`, the tag for the `@playwright/test`
  version resolved in `package-lock.json`. That image bakes Chromium and its shared libraries at
  `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, so three steps are gone: `npx playwright install
  --with-deps chromium`, the `id: playwright` version-output step, and the `actions/cache` entry for
  `~/.cache/ms-playwright` that the version keyed. `npm ci`, `setup-node` 22, `npm run test:e2e` and
  the failure-artifact upload are unchanged.
- `AGENTS.md` §7 — the `e2e` description names the image instead of the install, and records the
  bump rule: move the tag in the same change as `@playwright/test`, because a mismatched image
  leaves Playwright looking for a Chromium revision it does not ship.
- `agents/tasks.md` — T-021 row. `agents/log/README.md` — index row. This entry.

## Verified

- `npx --yes js-yaml .github/workflows/ci.yml` → parses. The five job ids are still `verify`,
  `e2e`, `migrations`, `docker`, `audit`; the `container:` block names the image; and
  `grep -v '^\s*#' … | grep -E 'playwright install|actions/cache|ms-playwright'` returns nothing,
  i.e. those strings survive only in the explanatory comment, not as steps.
- Image tag exists: `GET mcr.microsoft.com/v2/playwright/manifests/v1.65.1-noble` → **HTTP 200**.
  `Dockerfile.noble` confirms the image sets `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`, installs
  Chromium into it, and runs as `root` by default (Chromium sandbox off, which the Playwright docs
  call acceptable for trusted end-to-end tests).
- PR [#20](https://github.com/UAnirudh/kanso/pull/20) run
  [46046533389](https://github.com/UAnirudh/kanso/actions/runs/46046533389) on `3edc753` →
  **success**, attempt 1, all five check runs green:
  - `playwright acceptance` 102 s (job 140667087360): `Initialize containers` 29 s,
    `actions/checkout` 2 s, `setup-node` 1 s, `npm ci` 7 s, `npm run test:e2e` 57 s, artifact upload
    skipped (no failure). The job contains no Playwright install step at all, and every spec would
    call `browserType.launch` — a green suite means Chromium resolved from the image.
  - `typecheck · test · build` 46 s · `schema upgrade from previous release` 12 s ·
    `docker build · volume smoke` 100 s (script 92 s) · `npm audit (high)` 7 s.
- Timing, honestly: the job is **not** faster. Pulling and starting the container costs 29 s, where
  the cached download plus apt used to cost 9–22 s on a good mirror (last green `main` run: 92 s
  job, 62 s of tests). The gain is that nothing in the job now depends on the runner's package
  sources, which is the failure this change exists to remove.

## After the first green run

- `main` moved while the PR was open (#18 and #19 landed the every-page axe gate) and that session
  claimed T-020 in `agents/tasks.md`. This branch's row and index entry were renumbered to T-021 and
  current `main` was merged in (`6637336`), keeping both sides of the two append-only conflicts.
- Between the two pushes the PR read `mergeable_state: dirty`, and **a conflicting pull request gets
  no workflow run at all**: `head_sha=76c4e29` had zero check runs and the branch listed no run,
  because without a merge commit there is no `refs/pull/20/merge` for `pull_request` to test. The
  fix is to merge `main`, not to re-push or re-run.
- That merge produced run
  [46047506548](https://github.com/UAnirudh/kanso/actions/runs/46047506548) on `6637336` — all five
  checks green again: `playwright acceptance` 106 s, `typecheck · test · build` 35 s,
  `schema upgrade from previous release` 15 s, `docker build · volume smoke` 90 s,
  `npm audit (high)` 9 s. It also exercised the merged-in accessibility changes inside the
  container, so the job is proven against the current tree and not only against this change's two
  files.

## Not verified

- No Docker daemon in this workspace, so the image was never pulled or run locally; the container
  path is exercised only on the amd64 GitHub runner.
- The apt failure was not reproduced and then shown fixed — it depended on a runner that lacked the
  Ubuntu archive. The change removes the failure mode by construction rather than by observation.
- The image is pinned by tag, not by digest, and the tag is not asserted against the installed
  `@playwright/test` version in CI. A re-tagged image, or a lockfile bump without a tag bump, still
  fails the job — it just does so with Playwright's "executable doesn't exist" error, which the
  §7 note now explains.
- `npm ci` and the tests were not run locally; CI is the only execution.

## Next step

Review and merge PR #20. After it is on `main`, the next deploy-related gap is making
`schema upgrade from previous release`, `docker build · volume smoke` and `npm audit (high)`
required status checks (T-013 describes the current classic protection; AGENTS.md §7 says to do it
once they have stayed green across a few changes — they have now run green on every PR since #9).

## Open questions

- Container start-up (29 s) is now the job's largest fixed cost, larger than the apt phase it
  replaced. If that becomes worth optimising, the options are a larger runner with a warm image
  cache or a self-hosted runner; both cost more than the minutes saved. Not proposed.
