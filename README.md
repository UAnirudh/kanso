# Kanso

An AI-native workspace where **each person's interface is generated for them** on top of the same
shared application. Data, permissions and business logic stay shared; layout, components and
styling are per-user, validated, versioned and reversible.

- Generate a working project workspace from a sentence.
- Ask for changes in plain language ("move my tasks left, add a progress chart right, dark mode").
- Preview the change, apply it, undo it, restore any earlier version, or reset to the generated layout.
- Rename or delete applications you no longer test with, from the dashboard.
- Teammates share the data but never each other's layout.
- Create an account to carry your interface and role to another device; guests keep working
  without one.

Under the hood the assistant never writes code: it proposes typed operations against a validated
interface document, which the server checks, previews, applies and versions.

**Documentation site:** <https://uanirudh.github.io/kanso/> — static project docs only. GitHub
Pages cannot serve this application (no server runtime, no database); see [Deployment](#deployment).

## Working in this repository

Read [`AGENTS.md`](AGENTS.md) before your first edit: it is the contract for *how* to change things
(invariants, commands, the verification ladder, and the rules for several agents working at once).
`CLAUDE.md` points at it. Live coordination state lives in [`agents/`](agents/) — claim a row in
[`agents/tasks.md`](agents/tasks.md) before you start, and leave a dated handoff in
[`agents/log/`](agents/log/) when you finish.

## Quick start

```bash
npm install
cp .env.example .env.local     # optional: add GROQ_API_KEY for model-driven edits
npm run db:migrate             # creates .data/kanso.db and applies migrations
npm run dev                    # http://localhost:3000
```

Open the app — no account is required — describe an application, and you land in a working workspace. Each browser receives a private guest identity inside one shared workspace, so you should see the interface immediately. To use that identity on a second device, create an account from **Save this browser** in the header.

Requirements: Node.js 20.9+ (developed on Node 24), npm. No external services are required —
SQLite is local, and the interface assistant works without any API key.

**Use Node 20–24.** `better-sqlite3` 12.x ships no prebuilt binary for Node 25+, so `npm install`
fails there while compiling the native module. Node 24 is what the Docker image and the test suite
are verified on; `.nvmrc` pins it, so `nvm use` selects the right runtime.

## Environment

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_PATH` | no | `.data/kanso.db` | SQLite file path (relative to the project or absolute) |
| `GROQ_API_KEY` | no | — | Enables model-driven interface edits (server-side only) |
| `GROQ_MODEL` | no | `qwen/qwen3-32b` | Any Groq-supported chat model id |
| `GROQ_BASE_URL` | no | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `8` | Per-user AI edit budget |
| `AI_DAILY_TOKEN_CAP` | no | `0` (off) | Global daily model-token ceiling; the assistant returns 503 once the day's tokens reach it |
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
| `npm test` | Vitest unit suite (engine, planner, validation, accounts, sessions, credential budgets) |
| `npm run e2e:setup` | One-time browser setup: Chromium plus its system libraries, no root needed |
| `npm run test:e2e` | Playwright acceptance and axe accessibility suites (starts its own server on :3100 with a fresh DB) |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:reset` | Delete the local database (schema rebuilds on next request) |
| `node scripts/shots.mjs` | Screenshot the running app to `screenshots/` for visual QA |
| `node scripts/ai-provider-check.mjs` | Provider error-path check (uses an invalid key against a local server) |

The Playwright suite needs the browser installed once: `npm run e2e:setup`. The script
checks the Node version, downloads Chromium, and on Linux extracts the libraries Chromium needs
(`libnss3`, `libatk`, fonts, …) into `~/.cache/kanso-e2e-deps` when they are missing — Playwright's
own `install-deps` requires root, this does not. `npm run test:e2e` sources that environment
automatically. Set `KANSO_E2E_DEPS` to put the prefix somewhere else.

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
app/                    routes: dashboard, workspace, API handlers, server actions
components/workspace/   shell (sidebar, top bar), assistant panel, history, dialogs
components/workspace/render/  surface canvas, registry, the ten component views
lib/interface/          types, catalogue, operations, engine, store, service, templates, controls
lib/ai/                 provider adapter, prompts, local planner, pipeline
lib/identity.ts · lib/client-origin.ts  identity resolution, cookie options, caller origin
lib/repo/               SQL data access (guests, accounts, workspaces, apps, records, ai, budgets)
lib/services/           application generation
migrations/             SQL schema
tests/ · e2e/           Vitest unit tests · Playwright acceptance tests
scripts/                migrations, reset, screenshots, provider check
PRD.md · ARCHITECTURE.md · IMPLEMENTATION_PLAN.md
AGENTS.md · CLAUDE.md · agents/   the agent contract, its pointer, and the shared task board + handoff log
```

## Accounts, sessions and budgets

Guests stay the default: no sign-up is needed to use the workspace. Creating an account **claims the
browser's guest in place**, so the membership, personal interface documents and revisions it already
has stay attached to the same user id — nothing is copied. From then on a session cookie resolves that
identity on any device, so the role and the layout follow the person rather than the browser.

- Passwords are hashed with scrypt (`node:crypto`, per-hash salt, constant-time compare). Only
  SHA-256 hashes of session tokens are stored, with a 30-day expiry and pruning on sign-in.
- Signing out revokes the session and expires the cookie; because a claimed row no longer carries a
  device id, that browser returns as a fresh guest.
- Credential attempts share the `rate_limit_events` sliding window: **5 sign-ins per email and 20 per
  network per 15 minutes**, **3 sign-ups per email and 20 per network per 15 minutes**. Attempts are
  counted before the password is checked, and the network key is a SHA-256 hash, so no IP addresses
  are stored.
- The per-network budget depends on a proxy that sets `x-forwarded-for` (or `x-real-ip`); requests
  with neither header share one `unknown` bucket.

There is no password reset, email verification or account deletion yet, and sign-in is not
captcha-protected.

## Roles

Every browser that opens the deployment joins the shared workspace automatically, so there is no
invite step and no owner to appoint. A signed-in account is the same membership row, so its role
follows it to any device. The workspace is owned by Kanso itself, not by a browser, and
every guest joins as an `admin` — so clearing one browser's cookie can never leave the workspace with
nobody able to manage it, and a stale guest can still be retired from the roster. `owner` / `admin`
manage members and settings · `member` edits tasks and notes · `viewer` reads only. **Interface customization is available to every role** and is always scoped to the person
doing it — a viewer can rearrange their view but cannot write data, and cannot affect anyone else.

## Metrics

`/metrics` is a read-only page for AI spend and proposal quality, linked from the dashboard.
The same numbers are available as JSON at `GET /api/metrics`; both read through `loadAiMetrics`,
and the JSON route needs the device cookie like every other API route and answers
`cache-control: no-store`.

- `spend` is **global** — today's tokens against `AI_DAILY_TOKEN_CAP`, the budget that can start
  refusing requests — because the cap is not per workspace.
- `proposals` covers the last 30 days across the workspaces this browser belongs to. Acceptance
  is PRD §8's **applied without retry ÷ decided**: a preview still waiting for a decision is not
  a rejection, so pending stays out of the denominator, and an applied proposal followed by
  another request from the same browser for the same app within 10 minutes counts as a retry
  rather than an acceptance.
- `latencyMs`, `timeToFirstPersonalizationMs` and `tokens` use the same window and scope: p50/p95
  request latency, the median from a browser's first open (its `init` revision) to its first
  applied assistant change, and tokens per proposal and per applied change. The local planner
  records zero tokens, so a key-less run shows real acceptance and latency with zero spend.

## Testing

```bash
nvm use                       # Node 24 via .nvmrc
npm run typecheck
npm test
npm run e2e:setup             # once: Chromium + its system libraries
npm run test:e2e
```

`e2e:setup` is idempotent and reports what it installed. It refuses to run on Node 25+ with an
explanation rather than failing later inside the native SQLite build.

The acceptance suite (`e2e/acceptance.spec.ts`) covers: guest identity minting,
application generation, task creation and persistence across reload, the natural-language change
with preview and apply, interface persistence across re-navigation, a second browser with its own
interface over the same shared data, viewer role enforcement at the API, version restore, undo,
mobile layout and assistant behaviour, recovery after the first browser clears its cookie, plus a
separate spec for cookieless requests, the health endpoint, the absence of an owner row and role
boundaries.

## Deployment

The repository ships a production image (`Dockerfile`) and a Render Blueprint (`render.yaml`) that
attaches a persistent disk, so guest identities, workspaces and interfaces survive deploys and
restarts.

### Deploy on Render (recommended: one click after connecting the repo)

1. Open the Render Dashboard → **New → Blueprint** and select the GitHub repository
   `UAnirudh/kanso`. Render reads `render.yaml` from the default branch.
2. Confirm the service it proposes: Docker build, `plan: 0.5c-512mb`, a 1 GB disk mounted at
   `/var/data`, `DATABASE_PATH=/var/data/kanso.db`, and `GROQ_API_KEY` as a prompted secret.
3. Click **Apply** / **Deploy Blueprint**. The first build takes several minutes: the image compiles
   `better-sqlite3` and runs `next build`.
4. If Render prompts for `GROQ_API_KEY`, you can paste it now or leave it blank. Both work — with no
   key the assistant runs on the labelled deterministic planner and says so in the UI.
5. When the service is live, open `https://<service-name>.onrender.com`. The first request creates
   and migrates the database, then generate a workspace. No sign-up is required: the first request
   assigns this browser a guest identity. Create an account from the header if you want to sign in
   from another device.

**Add or change the API key later:** service → **Environment** → add or edit `GROQ_API_KEY` →
**Save**. Render redeploys the service; the disk, and therefore all data, is untouched. Never put
the key in a `NEXT_PUBLIC_` variable and never commit it.

### Run the same image anywhere

```bash
docker build -t kanso .
docker run -d --name kanso -p 3000:3000 \
  -v kanso-data:/var/data \
  -e GROQ_API_KEY=... \
  kanso
```

The container applies migrations on start, serves on `$PORT` (default 3000) as a non-root user,
and keeps the database at `/var/data/kanso.db`. Mount `/var/data` or the data is lost when the
container is replaced. Without `GROQ_API_KEY` it runs the deterministic planner.

### What it costs, keeping data

| Host | Cheapest configuration that preserves data | Monthly |
| --- | --- | --- |
| Render | `0.5c-512mb` web service ($7) + 1 GB disk ($0.25/GB) | ~$7.25 |
| Railway | Hobby, $5 minimum usage; includes 5 GB volume | ~$5 |
| Fly.io | `shared-cpu-1x` 512 MB ($3.69) + 1 GB volume ($0.15) | ~$3.84 |

Free tiers do not keep data: Render's Free plan cannot attach a disk at all (ephemeral filesystem,
files lost on every deploy or restart), and Railway's free allowance caps volumes at 0.5 GB. Fly
states that invoices under $5 are waived, so the Fly configuration may cost nothing in practice —
treat that as a published policy to confirm, not a guarantee. Prices are the hosts' published
rates as of November 2026, excluding tax.

Only the Render blueprint is wired up here. On Railway or Fly you supply the same three things:
the image, a volume mounted at `/var/data`, and `DATABASE_PATH=/var/data/kanso.db`.

### Data notes

- The disk survives deploys, restarts and rebuilds. It is **not a backup**: there are no automatic
  snapshots. Copy the file off periodically, or move to Postgres for managed backups.
- Run **one instance**. SQLite allows a single writer; a disk also pins the service to one instance.
- Deploys restart the service briefly; there is no zero-downtime swap with a disk attached.

Serverless platforms such as Vercel are still not suitable as-is: `better-sqlite3` needs a local
writable file. Moving to Postgres first is the path (see ADR-1 — queries are confined to
`lib/repo/*`, documents become `jsonb`, placeholders change from `?` to `$1`).

### Verified vs unverified

Verified on this machine: `npm run build`, the migration step, and `next start` with an absolute
`DATABASE_PATH` and a custom `PORT`, including a real guest-identity → generate → reload flow against that
production server. Also verified: the Docker image build, a container run against a named volume at
`/var/data` (health 200, server as the unprivileged `kanso` user, real guest data written), data and
identity surviving `docker restart`, and `PORT=10000` being honoured so Render's injected port works.
**Not verified here:** the Render deployment itself (local image is arm64, Render builds amd64) and a
live Groq completion (no key on this machine).

## Known limitations

- **Single-node SQLite**: one writer, no horizontal scaling, no managed backups yet.
- **Model path unverified end to end**: the Groq integration is implemented and its error path is
  exercised, but this environment has no `GROQ_API_KEY`, so the acceptance suite runs through the
  labelled deterministic planner. A successful live completion is unverified here.
- **Application generation is template-constrained** (two templates) by design; it is not arbitrary
  software generation.
- **No continuous learning**: personalization comes from explicit requests and saved versions only.
- **Undo/restore** are snapshot-based; there is no operation-level redo stack or diff viewer.
- **Guests are still cheap identities.** Without signing in, every browser joins one shared
  workspace automatically, so anyone with the URL can read and edit the shared data, and clearing
  cookies starts a new guest identity. The device cookie is an identity, not an authentication
  boundary; only a signed-in session is a credential.
- **Members can be browsers or people.** Removing a guest ends that browser's access, but it can
  rejoin with a fresh cookie; an account member can sign in again unless its password is changed.
  Removal prunes the roster but is not a security control.
- **No account recovery.** There is no password reset, email verification or account deletion, and
  sign-in has no captcha. Per-network throttling trusts `x-forwarded-for`/`x-real-ip`, so a proxy
  must set one of them.
- **Access boundary returns a 404 screen with HTTP 200** when the route streams its loading shell
  (no application data is exposed; the API returns 403).
- CSV export, real-time collaboration, SSO and billing are not implemented.
