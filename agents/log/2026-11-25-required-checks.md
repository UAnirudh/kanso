# Branch protection: both CI jobs required on main (T-013)

- Date: 2026-11-25
- Agent: codebuff
- Task: T-013
- Branch: `agent/required-checks-docs` (repository setting; no application code changed)

## Goal

The workflow ran on pull requests, but nothing stopped a red PR from merging, so the gate was
advisory. Make `typecheck · test · build` and `playwright acceptance` required status checks on
`main` — and prove that a real PR reports exactly those two contexts, because a name mismatch would
block every merge forever.

## Changed

- Repository setting (not a file): classic branch protection on `main`.
  - Required status checks: `typecheck · test · build` and `playwright acceptance`, both pinned to
    the GitHub Actions app (`app_id 15368`) so no other app can satisfy them by name.
  - `strict: false` — a branch does not have to be up to date with `main` to merge.
  - `enforce_admins: true` — administrators cannot bypass the checks.
  - No review requirement, no push restrictions, no force pushes, no deletions.
- `AGENTS.md` §7 — records that `main` is protected and that a direct push is refused.
- `agents/tasks.md` — T-013 filed and closed.
- `agents/log/README.md` — index row.

## Verified

- Before: `GITHUB_GET_A_BRANCH` reported `main` as `protected: false` with
  `required_status_checks.enforcement_level: "off"`, and `GITHUB_LIST_REPOSITORY_RULESETS` returned
  no rulesets.
- After: `GITHUB_GET_BRANCH_PROTECTION` returns `enforce_admins.enabled: true` and
  `checks: [{app_id: 15368, context: "typecheck · test · build"}, {app_id: 15368, context:
  "playwright acceptance"}]`, `strict: false`.
- Live probe with a real pull request: branch `ci/required-check-probe`, one empty commit
  `51c958a`, draft PR #1. The `pull_request` event fired
  ([run 45568819728](https://github.com/UAnirudh/kanso/actions/runs/45568819728), success, 65 s) and
  reported check runs named exactly `typecheck · test · build` (success) and `playwright
  acceptance` (success) on the head commit, and the PR reported `mergeable_state: clean`. PR #1 was
  closed without merging and its branch deleted, so no work is left behind.
- **Direct push is refused.** `git push origin main` after the setting landed returned
  `! [remote rejected] main -> main (protected branch hook declined)` with
  `remote: error: GH006: Protected branch update failed for refs/heads/main. - 2 of 2 required
  status checks are expected.` The protection therefore gates pushes as well as merges: every change
  now has to arrive as a pull request whose checks have run.

## Not verified

- A **red** PR being refused at the merge button. The push refusal above shows the checks are
  enforced by the server; a failing PR has not been observed end to end, because that needs a
  deliberately broken branch and the same two jobs that pass on `main`.
- Fork PRs still need maintainer approval before the workflow runs (GitHub's default).

## Next step

Work on a branch and open a PR for every change: push the branch, let both checks go green, then
merge. If a job is ever renamed in `.github/workflows/ci.yml`, update the protected-branch check list
in the same change — otherwise merges wait forever for a context that no longer exists.

## Open questions

- Direct pushes are now blocked as a side effect of requiring checks. If that is stricter than
  wanted, turning `enforce_admins` off restores admin bypass (and admin pushes), at the cost of a
  merge that can ignore a red check.
- Should `strict` be on, so a branch must be up to date with `main` before merging? It prevents
  "green on an old base" merges at the cost of a rebase per merge; off for now.
