# Playwright cache restores on a pull request run

- Date: 2026-11-27
- Agent: codebuff
- Task: T-007
- Branch: `agent/playwright-cache-pr-hit`

## Goal

#13 added an `actions/cache` entry for `~/.cache/ms-playwright` keyed on the installed
`@playwright/test` version, but the only run that had proved a hit was a re-run of #13 itself. The
open question was whether the *next* `pull_request` run would restore the entry that `main`'s push
run saved (`main` run 46010868558 saved `ms-playwright-Linux-1.65.1` into `refs/heads/main`), or
whether every PR would start from a miss. This session opens a docs-only PR to answer that, and
records the answer plus the remaining apt exposure.

## Changed

- `AGENTS.md` — §7 described the `e2e` job as if Chromium were downloaded on every run. It now
  names the cache, its key, and the part of the job a slow mirror can still affect
  (`--with-deps` still apt-installs the font packages).
- `agents/log/README.md` — index row for this entry.
- `agents/tasks.md` — T-007 log cell links this entry.

## Verified

- `main` push run [46010868558](https://github.com/UAnirudh/kanso/actions/runs/46010868558)
  (commit `3e98f41`, #13's merge) → **success**, 2 check runs, no duplicate PR run. Its `e2e` job
  logged `Cache not found for input keys: ms-playwright-Linux-1.65.1` and its post-step saved
  293 MB under `refs/heads/main`. Cache misses on the first `main` run of a new key are expected:
  an entry saved from `refs/pull/13/merge` is not readable from `refs/heads/main`, but the reverse
  (a PR reading the default branch's entries) is what this session tested.
- PR #14 (`3622de1`, docs-only) run
  [46011646322](https://github.com/UAnirudh/kanso/actions/runs/46011646322) → **success**;
  `typecheck · test · build` 41 s, `playwright acceptance` 79 s
  (job [140548388557](https://github.com/UAnirudh/kanso/actions/runs/46011646322/job/140548388557)).
- That `e2e` log, verbatim: `key: ms-playwright-Linux-1.65.1` →
  `Cache hit for: ms-playwright-Linux-1.65.1` → `Received 307325513 of 307325513 (100.0%),
  266.9 MB/s` → `Cache restored successfully` → `Cache restored from key:
  ms-playwright-Linux-1.65.1`. The `actions/cache` step took 3 s (13:58:17 → 13:58:20) and the
  post-step took 0 s, i.e. a hit skips the save. **So yes: a `pull_request` run restores the cache
  `main` saved.**
- Install step on that hit: 22 s (13:58:20 → 13:58:42), tests 39 s. For comparison, the same step
  took 46 s on `main`'s miss and 13 s on #13's re-run attempt, and 6 m 01 s in the 2026-11-26 run
  that motivated the cache.
- The apt phase is unchanged by the cache and is now the largest fixed part of the step:
  `Fetched 22.3 MB`, `2 upgraded, 9 newly installed` (the 9 fonts plus `libasound2t64` /
  `libasound2-data`). Every Chromium runtime library reports "already the newest version" on
  `ubuntu-26.04` (image `20261116.88.1` this run, `20261122.9.1` on `main`'s — which is why two
  packages upgraded here).
- `git status` on the branch was clean before the log commit; the PR contains only `AGENTS.md` plus
  this entry and the two index/cell edits.

## Not verified

- No local build, typecheck or test run: the PR touches Markdown only, and CI covers the ladder.
- Nothing was exercised against a Playwright upgrade. A version bump changes the key by design, so
  the first run after a bump should miss and re-save; that path was not observed here.
- The claim that caching is worth it for the *browser* (Playwright's own CI guide advises against
  caching browsers) is measured only on this repo's runner: 293 MB restores in ~3 s here versus a
  ~150 MB download plus the mirror's behaviour. The two slow runs are the evidence, not a benchmark.
- Whether `--with-deps` can be dropped was not tested on a throwaway branch. The log shows why it
  is tempting (no missing *libraries*, only fonts) and why it is risky, but no run tried it.

## Next step

Merge PR #14 when the human asks; it is docs-only and green. If the font fetch ever stalls a run
again, the next lever is the Playwright container image
(`mcr.microsoft.com/playwright:v<same version>-noble`), not an apt cache — that was the conclusion
of the 2026-11-27 analysis, and this entry's numbers are the baseline to compare against.

## Open questions

- The apt phase (9 font/xfont packages, 22.3 MB every run) is the only part of `e2e` a mirror can
  still inflate. Leave it, or pin the job to the Playwright image? Not decided.
