# Kanso

An AI-native workspace where **each person's interface is generated for them** on top of the same
shared application. Data, permissions and business logic stay shared; layout, components and
styling are per-user, validated, versioned and reversible.

- Generate a working project workspace from a sentence.
- Ask for changes in plain language ("move my tasks left, add a progress chart right, dark mode").
- Preview the change, apply it, undo it, restore any earlier version.
- Teammates share the data but never each other's layout.

Under the hood the assistant never writes code: it proposes typed operations against a validated
interface document, which the server checks, previews, applies and versions.

## Quick start

```bash
npm install
cp .env.example .env.local     # optional: add GROQ_API_KEY for model-driven edits
npm run db:migrate             # creates .data/kanso.db and applies migrations
npm run dev                    # http://localhost:3000
```

Create an account, describe an application, and you land in a working workspace.

Requirements: Node.js 20.9+ (developed on Node 24), npm. No external services are required —
SQLite is local, and the interface assistant works without any API key.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_PATH` | no | `.data/kanso.db` | SQLite file path (relative to the project or absolute) |
| `GROQ_API_KEY` | no | — | Enables model-driven interface edits (server-side only) |
| `GROQ_MODEL` | no | `qwen/qwen3-32b` | Any Groq-supported chat model id |
| `GROQ_BASE_URL` | no | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `8` | Per-user AI edit budget |
| `AI_TIMEOUT_MS` | no | `25000` | Upstream request timeout |
| `NEXT_PUBLIC_APP_URL` | no | `http://localhost:3000` | Public origin used in docs/cookies |

**Model note:** Groq does not offer "Qwen 3.7". The verified Qwen ids are `qwen/qwen3-32b`,
`qwen/qwen3.6-27b` and `qwen/qwen3.8-27b`; the default is the stable `qwen/qwen3-32b`. Any other
Groq model id works via `GROQ_MODEL`. Without a key the assistant uses a deterministic rule planner
and says so in the UI — it never pretends to be a model.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm test` | Vitest unit suite (engine, planner, validation) |
| `npm run test:e2e` | Playwright acceptance suite (starts its own server on :3100 with a fresh DB) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:reset` | Delete the local database (schema rebuilds on next request) |
| `node scripts/shots.mjs` | Screenshot the running app to `screenshots/` for visual QA |
| `node scripts/ai-provider-check.mjs` | Provider error-path check (uses an invalid key against a local server) |

The Playwright suite needs browsers once: `npx playwright install chromium`.

## How personalization works

1. **Document** — `lib/interface/types.ts` defines a JSON interface: theme, accent, density,
   navigation, pages, and components with typed props and a 12-column layout.
2. **Catalogue** — `lib/interface/catalog.ts` defines the ten approved components, their Zod prop
   schemas (with defaults), span bounds, data-binding allowlists and accessibility contracts.
3. **Operations** — `lib/interface/operations.ts` is the complete vocabulary (14 operations) the
   assistant or visual editor may use.
4. **Engine** — `lib/interface/engine.ts` applies operations atomically, strips unsupported props,
   repairs older documents, enforces limits and packs layouts without overlap.
5. **AI** — `lib/ai/prompt.ts` builds the context; `lib/ai/provider.ts` calls Groq with timeouts and
   bounded retries; `lib/ai/pipeline.ts` validates, repairs once, stores a proposal and only
   applies after an explicit user action, with a stale-base check.
6. **Storage** — one document per `(app, user)` plus append-only revisions; undo and restore are
   new revisions, so recovery is itself recoverable.

## Project layout

```
app/                    routes: auth pages, dashboard, workspace, API handlers, server actions
components/workspace/   shell (sidebar, top bar), assistant panel, history, dialogs
components/workspace/render/  surface canvas, registry, the ten component views
lib/interface/          types, catalogue, operations, engine, store, service, templates, controls
lib/ai/                 provider adapter, prompts, local planner, pipeline
lib/repo/               SQL data access (users, workspaces, apps, records, ai)
lib/services/           application generation
migrations/             SQL schema
tests/ · e2e/           Vitest unit tests · Playwright acceptance tests
scripts/                migrations, reset, screenshots, provider check
PRD.md · ARCHITECTURE.md · IMPLEMENTATION_PLAN.md
```

## Roles

`owner` / `admin` manage members and settings · `member` edits tasks and notes · `viewer` reads
only. **Interface customization is available to every role** and is always scoped to the person
doing it — a viewer can rearrange their view but cannot write data, and cannot affect anyone else.

## Testing

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
```

The acceptance suite (`e2e/acceptance.spec.ts`) covers: registration, application generation,
task creation and persistence across reload, the natural-language change with preview and apply,
layout persistence across a new login, a second member with an independent interface, viewer
role enforcement at the API, version restore, undo, mobile layout and assistant behaviour, plus a
separate spec for unauthenticated and cross-workspace access.

## Deployment

Not deployed from this environment. The app is a standard Next.js server app with one requirement:
**a persistent disk for the SQLite file** (Fly.io, Render, Railway, a VM — anything that runs
`next start` with a volume). Serverless platforms such as Vercel are not suitable as-is because
`better-sqlite3` writes to local disk; move to Postgres first (see ADR-1: queries are confined to
`lib/repo/*`, documents become `jsonb`, placeholders change from `?` to `$1`).

Set `GROQ_API_KEY` as a server-side secret. Never expose it with a `NEXT_PUBLIC_` prefix.

## Known limitations

- **Single-node SQLite**: one writer, no horizontal scaling, no managed backups yet.
- **Model path unverified end to end**: the Groq integration is implemented and its error path is
  exercised, but this environment has no `GROQ_API_KEY`, so the acceptance suite runs through the
  labelled deterministic planner. A successful live completion is unverified here.
- **Application generation is template-constrained** (two templates) by design; it is not arbitrary
  software generation.
- **No continuous learning**: personalization comes from explicit requests and saved versions only.
- **Undo/restore** are snapshot-based; there is no operation-level redo stack or diff viewer.
- **Invites require an existing account**; there is no email delivery.
- **Access boundary returns a 404 screen with HTTP 200** when the route streams its loading shell
  (no application data is exposed; the API returns 403).
- CSV export, real-time collaboration, SSO and billing are not implemented.
