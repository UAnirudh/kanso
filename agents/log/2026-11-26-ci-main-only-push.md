# CI runs once per PR push: push trigger scoped to `main` (T-007)

- Date: 2026-11-26
- Agent: codebuff
- Task: T-007
- Branch: `feat/application-lifecycle-and-e2e-setup` (PR #3)

## Goal

Stop each push to a branch from starting a second, identical copy of both CI jobs next to the
`pull_request` run for the same commit, without losing a post-merge check on `main`.

## Changed

- `.github/workflows/ci.yml` — `push:` now carries `branches: [main]`; `pull_request:` is unchanged
  (still no path or branch filters).
- `AGENTS.md` §7 — the CI sentence said the checks run "on every push and pull request". It now says
  every pull request plus every push to `main`, and that a branch push runs nothing by itself because
  `pull_request` is the branch gate.
- `agents/tasks.md` — the T-007 row no longer says "every push", and links this entry.
- `agents/log/README.md` — index row for this entry.
- PR #3 description — Verification/Notes now cover the trigger scope and the note-delete spec fix.

## Verified

- Push: `aff096f..eb3b2f0  HEAD -> feat/application-lifecycle-and-e2e-setup`.
- Workflow runs whose head is `eb3b2f0`: **one**, event `pull_request`, run
  [45588536127](https://github.com/UAnirudh/kanso/actions/runs/45588536127), `completed / success`
  (09:46:09Z → 09:47:36Z).
  - `typecheck · test · build` — success, 46 s.
  - `playwright acceptance` — success, 84 s.
- Check runs for the commit: `total_count: 2`. Under the old trigger the same push produced four,
  so the dedupe is observed rather than assumed.
- The only annotation is the Actions "Node.js 20 is deprecated" warning attached to
  `actions/checkout@v4` / `actions/setup-node@v4`; nothing failed.

## Not verified

- **No push-to-`main` run has happened under this trigger yet.** `branches: [main]` only takes
  effect for the next merge, so the post-merge gate is untested until then.
- Fork pull requests still wait for maintainer approval before the workflow starts (GitHub's
  default), unchanged by this.
- Still outside the gate: `bash docker/smoke-test.sh`, `npm audit`, the AI provider check, lint (no
  lint script) and the visual/axe spec (T-012).

## Next step

The next merge to `main` is the first run of the main-only trigger. If a job is renamed, update the
required-check list on `main` (T-013).

## Open questions

- Keep a post-merge run on `main` at all, now that the PR gate is a required check? It still catches
  a bad merge commit, at one run per merge.
