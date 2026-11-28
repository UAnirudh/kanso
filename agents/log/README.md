# Handoff log

One file per working session, so two agents appending at the same time never touch the same file and
never produce a merge conflict.

## Naming

```
agents/log/YYYY-MM-DD-<short-slug>.md
```

Use the date you *finished* and a slug that names the work, e.g.
`2026-11-20-docker-persistence.md`. If a slug already exists, add `-2`.

## Rules

- **Append-only.** Never edit or delete an entry written by someone else. Add a new file instead.
- **Link it** from your row in `agents/tasks.md`.
- **No secrets, no key values, no personal data.** Reference variable *names* only.
- **Be literal about verification.** Copy the command and its actual result. If you did not run it,
  write "not run" — a later agent will trust this file.

## Template

```markdown
# <Title>

- Date: YYYY-MM-DD
- Agent: <name/model>
- Task: <id from agents/tasks.md, or "none">
- Branch: <branch or working tree>

## Goal
One or two sentences: what this session was meant to achieve.

## Changed
- `path` — what changed and why (link the reason, not just the diff).

## Verified
- `command` → result (exit code, counts, status codes, timings).
- What you observed in the browser or container, if anything.

## Not verified
- What you did not run, and why (no keys, no Docker, arm64 vs amd64, needs a second browser, …).

## Next step
The single next action, concrete enough to start without re-reading this session.

## Open questions
Anything that needs the human's decision. Leave it empty rather than guessing.
```

## Index

| Date | Entry | Task |
| --- | --- | --- |
| 2026-11-20 | [Agent docs and collaboration setup](2026-11-20-agent-docs.md) | — |
| 2026-11-20 | [Docker image, volume persistence, Render review](2026-11-20-docker-persistence.md) | T-002 |
| 2026-11-24 | [Deep-link skeleton: not reproducible, `loading.tsx` removed](2026-11-24-deep-link-skeleton.md) | T-001 |
| 2026-11-24 | [Docker smoke test committed as the engine test](2026-11-24-docker-smoke-test.md) | T-003 |
| 2026-11-24 | [Dependency advisory triage: production tree to zero](2026-11-24-npm-advisory-triage.md) | T-005 |
| 2026-11-24 | [E2E confirmation for the zod 4 tree](2026-11-24-e2e-zod4-verification.md) | T-005 |
| 2026-11-24 | [Vitest 4.1.12: dev-tree advisories to zero](2026-11-24-vitest-advisory-bump.md) | T-006 |
| 2026-11-25 | [CI gate: typecheck, unit tests and build on every push](2026-11-25-ci-gate.md) | T-007 |
| 2026-11-25 | [CI part 2: first green run, Playwright acceptance job](2026-11-25-ci-playwright.md) | T-007 |
| 2026-11-25 | [CI part 3: e2e green on the runner, pull request trigger](2026-11-25-ci-pr-trigger.md) | T-007 |
| 2026-11-25 | [Branch protection: both CI jobs required on main](2026-11-25-required-checks.md) | T-013 |
| 2026-11-25 | [Global daily AI token cap](2026-11-25-ai-spend-cap.md) | T-008 |
| 2026-11-25 | [Metrics endpoint and the created_at index](2026-11-25-ai-metrics.md) | T-014 |
| 2026-11-25 | [A read-only metrics page](2026-11-25-metrics-page.md) | T-017 |
| 2026-11-25 | [PRD acceptance semantics and time to first personalization](2026-11-25-metrics-semantics.md) | T-018 |
| 2026-11-25 | [Security headers and their e2e assertions](2026-11-25-security-headers.md) | T-016 |
| 2026-11-25 | [CI gates for the three deploy failures](2026-11-25-ci-deploy-gates.md) | T-015 |
| 2026-11-26 | [CI runs once per PR push: push trigger scoped to main](2026-11-26-ci-main-only-push.md) | T-007 |
| 2026-11-26 | [First push to main under the main-only trigger: green](2026-11-26-ci-main-push-verified.md) | T-007 |
| 2026-11-27 | [Accessibility gate: axe on three surfaces](2026-11-27-a11y-gate.md) | T-012 |
| 2026-11-27 | [Playwright cache restores on a pull request run](2026-11-27-playwright-cache-pr-hit.md) | T-007 |
| 2026-11-27 | [Accessibility gate: both interface themes](2026-11-27-a11y-dark.md) | T-019 |
| 2026-11-27 | [Deploy gates brought up to date and green on current main](2026-11-27-ci-deploy-gates-unstick.md) | T-015 |
| 2026-11-27 | [Accessibility gate: every workspace page](2026-11-27-a11y-pages.md) | T-020 |
| 2026-11-27 | [E2E runs in the pinned Playwright container](2026-11-27-playwright-container-e2e.md) | T-021 |
| 2026-11-28 | [All five CI gates required on main](2026-11-28-required-deploy-checks.md) | T-022 |
