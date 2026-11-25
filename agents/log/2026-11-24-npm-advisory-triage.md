# Dependency advisory triage: production tree to zero

- Date: 2026-11-24
- Agent: Codebuff (Buffy)
- Task: T-005
- Branch: `main`

## Goal

T-005 was filed during T-003 because the image build reported 7 advisories (2 critical, 3 high)
from `npm ci`, and 4 (3 high) after `npm prune --omit=dev`. Decide which of those are reachable
from the shipped process, bump those, and leave the rest documented rather than blindly upgrading.

## Triage

`npm audit --omit=dev` on the old tree — the 4 advisories that survive into the runtime image:

| Package | Severity | Path | Reachable from the server? |
| --- | --- | --- | --- |
| `zod` | high | direct, 3.24.1 | **Yes.** `readJson` parses every JSON request body with a zod schema (`lib/api.ts`), and the AI apply route parses model output (`lib/ai/pipeline.ts`). GHSA-mrhx-c7xc-m3w5: memory exhaustion validating oversized constrained collections. |
| `postcss` | high | `next` → `postcss@8.4.31` | Build-time only. Next's CSS pipeline runs during `next build`; the runner serves prebuilt CSS. It is still shipped in `node_modules`, and no fix exists in the 15.x line (Next pins `8.4.31` exactly), which is why `npm audit` proposed Next 16. |
| `sharp` | high | `next` optional dep, 0.34.5 | No. Nothing imports `next/image`, so the `/_next/image` optimizer is never used by the app. Bumped anyway because Next 15.5.29 itself declares `sharp: "^0.34.3 \|\| ^0.35.5"`. |
| `next` | moderate | via `postcss` | Cleared by the postcss override; no Next 16 major bump needed. |

The 3 advisories that disappeared with `npm prune --omit=dev` (2 critical, 3 high in the full tree)
were dev-tooling only.

## Changed

- `package.json` — `zod` `3.24.1` → `4.6.7`; new `overrides` block: `postcss` `8.5.33`,
  `sharp` `0.35.5`. No new dependency, so AGENTS.md invariant 10 (no dependency without a written
  reason) is satisfied by this file.
- `lib/interface/operations.ts` — the only zod 4 shape change the codebase needed:
  `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` in two places (zod 4 requires an
  explicit key type). Everything else already used the zod 4 API: error handling reads
  `error.issues` (never the removed `.errors`), and no `.strict()`, `.merge()` or
  `z.ZodSchema` usage exists.

Why zod 4 and not a 3.x patch: the advisory range is `<4.6.6`, so no 3.x release fixes it.

Why `overrides` and not a direct dependency: `postcss` and `sharp` are Next's transitive pins. A
direct dependency would leave Next's nested copies in the tree; an override forces the single
patched version, and `postcss@8.5.33` was already the version `@tailwindcss/postcss` and vitest
resolved, so the build exercises it anyway.

## Verified

- `npm install` → exit 0, "removed 1 package, and changed 3 packages in 3s".
- `npm ls postcss sharp zod` → `postcss@8.5.33` (deduped, marked `overridden`), `sharp@0.35.5
  overridden`, `zod@4.6.7`.
- `npm audit --omit=dev` → `{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}`.
- `npm run typecheck` → exit 0, no output.
- `npm test` → exit 0, 4 files / **37 tests passed** (935 ms).
- `bash docker/smoke-test.sh` → **exit 0**, `PASS: image built, served /api/health, and kept its
  data across a restart.` Build stage: `npm ci` added 144 packages, audited 145, and printed
  `3 vulnerabilities (1 moderate, 2 critical)` — down from 7 (2 critical, 3 high) and all from the
  dev-only vitest chain, which `npm prune --omit=dev` then removes: the runtime stage prints
  `found 0 vulnerabilities`. `next build` compiled in 6.8 s, 5/5 static pages. Cold start
  `/api/health` → 200 in 2 s, server as `kanso` (uid 999). Rows `{users:1,…}` → `{users:2,
  workspaces:1, workspace_members:2}` with the same delta as T-003, and identical counts after
  `docker restart`; the guest `/dashboard` still resolved to 200. Volume `kanso.db` 180224 bytes,
  `kanso:kanso`.
- Inside the built image: `zod 4.6.7`, `sharp 0.35.5`, `postcss 8.5.33`, `next 15.5.29`; `sharp`
  loads and reports its bundled libvips, i.e. the override resolves a working native binary on
  linux/arm64.
- Cleaned up with `docker rm -f kanso-test && docker volume rm kanso-data` (no container left).

## Not verified

- **amd64 / Render.** The image is arm64; Render builds amd64, so this says nothing about that
  build. The `sharp` override is the one thing that could differ by platform: it needs a
  linux-x64-gnu binary in the Render build.
- **`npm run test:e2e` was not run.** The zod bump is a major version change across every API
  route; unit validation tests (`tests/validation.test.ts`, 8 tests) and the image-level guest
  flow cover the schemas, but no browser walkthrough was done on this tree.
- The AI success path was not exercised (no `GROQ_API_KEY`), same as T-003; only the validation
  code around it was type-checked and unit-tested.

## Next step

T-002: apply the Blueprint in the Render dashboard. Watch the `deps` stage for the `sharp` native
download on linux/x64 — that is the only platform-dependent part of this change.

## Open questions

- The full-tree audit still reports 2 critical + 1 moderate through `vitest@3.2.4` → `tinypool` /
  `@vitest/mocker`. Dev-only and pruned from the image, so filed as T-006 rather than fixed here
  (AGENTS.md §9.3). Bumping vitest is a major and belongs in its own commit.
