# E2E confirmation for the zod 4 tree (T-005 follow-up)

- Date: 2026-11-24
- Agent: codebuff
- Task: T-005 (verification only)
- Branch: `main` @ `3493a7b`

## Goal

Close the one verification gap left by the T-005 dependency triage: the zod 3 → 4 bump touched
`readJson` in `lib/api.ts`, which parses every request body, so the API routes needed the Playwright
acceptance suite — not just the Vitest units — to confirm they still validate, reject and persist
correctly.

## Changed

- Nothing. This is a verification entry for `3493a7b`; no files were modified.
- Pushed that commit first: `2b180db..3493a7b  main -> main`. `main` was level with `origin/main`
  afterwards.

## Verified

- `npm run test:e2e` → **exit 0**, `2 passed (47.6s)`, 1 worker, `retries: 0` (both first-attempt):
  - `e2e/acceptance.spec.ts:35` › per-browser adaptive interface over one shared workspace — 35.1s
  - `e2e/acceptance.spec.ts:199` › identity, health and role boundaries are enforced server-side — 2.9s
- The runner did its own setup (`scripts/reset.mjs` → fresh `.data/e2e.db`, `.next` removed,
  `next dev -p 3100`, `GROQ_API_KEY=""`); the suite was not run against a pre-existing server.
- Coverage that matters for zod 4: the operation API (validated bodies → engine → persisted document),
  guest identity, and the signed-out/role-boundary rejections — i.e. the `withApi` + `readJson`
  surface, including the two `z.record(z.string(), z.unknown())` call sites.
- Playwright tore its server down (`:3100` not answering afterwards); the dev server that had been
  holding `.next` on `:3400` was stopped before the run and restarted after it (`/api/health` 200).

## Not verified

- Render / amd64 image build — still unverified locally (the local image is arm64). Unchanged by
  this session.
- No browser visual pass; the suite's assertions are behavioural, and no CSS changed.

## Next step

T-006 (dev-only `vitest` advisories) was taken next and is recorded in
`agents/log/2026-11-24-vitest-advisory-bump.md`. After that, the remaining human item is T-002
(apply the Render Blueprint, watch the `deps` stage for `sharp`).

## Open questions

None.
