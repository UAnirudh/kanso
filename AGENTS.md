# AGENTS.md

Instructions for any AI agent (or human) working in this repository. Read this before your first
edit. It is short on purpose: the reasoning lives in the docs listed below, and this file is the
contract for *how to change things without breaking them*.

Last reviewed: 2026-11-24 (see `agents/log/` for the entry that produced the current state).

## 1. What this project is

Kanso is a Next.js 15 App Router app where **each user's interface is generated for them** on top of
one shared application. Data and permissions are shared; layout, components and styling are
per-user, stored as a validated JSON document, versioned and reversible.

The assistant never writes code. It emits typed `InterfaceOperation` objects against a closed
vocabulary, which the server validates, previews, applies atomically and versions.

Stack: Next.js 15.5 (App Router, server components + server actions) · React 19 · TypeScript strict ·
Tailwind v4 · SQLite via `better-sqlite3` (WAL) · Zod · Groq (optional) · Vitest + Playwright.

## 2. Source of truth (read the relevant one, don't re-derive it)

| File | Owns | Update it when |
| --- | --- | --- |
| `README.md` | Human-facing setup, env vars, scripts, deployment, known limitations | A command, env var or deploy step changes |
| `ARCHITECTURE.md` | Internals, data model, authz matrix, AI pipeline, **ADR log (ADR-1…ADR-10)** | You change a design decision — add a new ADR, never rewrite an old one |
| `PRD.md` | Product intent, audience, MVP scope, non-goals | Scope changes |
| `IMPLEMENTATION_PLAN.md` | Phase status `[x]` verified · `[~]` partial · `[ ]` not done | You move an item between states |
| `AGENTS.md` (this file) | How to work here | A rule or gotcha changes |
| `agents/tasks.md` | Shared claim board | You start, block or finish work |
| `agents/log/` | Per-session handoff notes | You finish a chunk of work |

`docs/` is **not** project documentation — it is the published GitHub Pages site
(`docs/index.html`). Do not put working notes there.

## 3. Commands

```bash
npm install                      # or `npm ci` for a clean, lockfile-exact install
cp .env.example .env.local       # optional; only GROQ_API_KEY needs a real value
npm run db:migrate               # creates .data/kanso.db, applies migrations
node scripts/migrate-check.mjs   # CI: builds a DB at the previous migration, applies the rest, checks foreign keys
npm run dev                      # http://localhost:3000

npm run typecheck                # tsc --noEmit (strict) — run this always
npm test                         # Vitest unit suite (engine, planner, validation, identity)
npm run test:e2e                 # Playwright; starts its own server on :3100 with a fresh DB
npx playwright install chromium  # once per machine, before test:e2e

npm run build && npm start       # production build + server
npm run db:reset                 # delete the local DB (schema rebuilds on next request)
node scripts/shots.mjs           # screenshot the running app into screenshots/ for visual QA
```

Docker / deploy (the container applies migrations on boot and serves `$PORT` as a non-root user):

```bash
docker build -t kanso .
docker run -d --name kanso -p 3000:3000 -v kanso-data:/var/data kanso
bash docker/smoke-test.sh        # build + volume + restart persistence check
```

`render.yaml` describes the Render Blueprint (Docker, 1 GB disk at `/var/data`,
`DATABASE_PATH=/var/data/kanso.db`, `GROQ_API_KEY` as a prompted secret).

## 4. Hard invariants — breaking one of these is a bug even if tests pass

1. **The model never produces code.** Only `InterfaceOperation` objects. No `eval`, no dynamic
   `import()` of model/user input, no `dangerouslySetInnerHTML`, no generated React/JS (ADR-4).
2. **The vocabularies are closed.** A new component needs *all* of: an entry in
   `lib/interface/catalog.ts` (Zod props with defaults, span bounds, data-source allowlist),
   a matching `Record<ComponentType, View>` entry in `components/workspace/render/registry.tsx`
   (the compiler enforces this), and a unit test. A new operation needs to be added to
   `lib/interface/operations.ts`, applied in `lib/interface/engine.ts`, and covered by a test.
3. **Migrations are append-only.** Never edit a shipped `migrations/NNNN_*.sql`; add the next
   number. Table rebuilds are applied with foreign keys off and `PRAGMA foreign_key_check` before
   the file is recorded (see `lib/db.ts` and `scripts/migrate.mjs` — keep them in step).
4. **SQL lives only in `lib/repo/*`.** Parameterised statements only, `?` placeholders (ADR-1 keeps
   the Postgres exit a driver + placeholder change). No SQL in routes, components or services.
5. **Identity is server-derived.** No client-supplied user id or role, ever. Every app request
   resolves through `requireAppAccess(appId, userId)` → app → workspace → membership → role.
6. **Every mutating API route** uses `withApi` (safe error envelope), `assertSameOrigin`,
   `readJson(request, schema)` (Zod) and returns `cache-control: no-store` via `json()`.
7. **Interfaces are per `(app, user)`.** Never write another user's document. A viewer may
   customize their own view but cannot write data.
8. **History is append-only.** Undo and restore append a new revision (`undo` / `restore`); the
   current document and the newest revision are written in one transaction.
9. **Secrets stay server-side.** `GROQ_API_KEY` is read only in server modules; never in a
   `NEXT_PUBLIC_*` variable, never in the client bundle, never in git.
10. **No new dependencies without a reason written down.** ADR-6/7/8 deliberately avoid component,
    state and charting libraries. Prefer the existing tokens/primitives; if a dependency is truly
    needed, add an ADR.
11. **Never put a `loading.tsx` on a dynamic route; use an in-page `Suspense` instead.** A
    route-level boundary flushes the shell before the page's access check runs, so a missing or
    forbidden app answers `200` with a 404 screen instead of `404`. Measured 2026-11-24: with
    `app/apps/[appId]/loading.tsx` present, `/apps/<unknown>` returned 200; without it, 404, with
    client navigation, reload and a cold load all still rendering in under 0.5 s
    (`agents/log/2026-11-24-deep-link-skeleton.md`). The pending UI lives in
    `<Suspense fallback={<WorkspaceSkeleton />}>` **inside** `app/apps/[appId]/page.tsx`, added only
    after `requireAppAccess` has succeeded — below that point it cannot change the status code, and
    above it it regresses the 404.

## 5. Where things live

```
app/                        routes, API handlers, server actions (app/actions.ts)
app/apps/[appId]/page.tsx   workspace entry: access check → Suspense → load everything → WorkspaceClient
components/workspace/       shell (Sidebar, TopBar), AiPanel, HistoryDrawer, dialogs
components/workspace/render/  canvas, registry (type → component), the ten component views
lib/interface/              types, catalog, operations, engine (apply/normalize/pack), store, service,
                            templates, controls
lib/ai/                     provider (Groq adapter), prompt, local-planner (labelled fallback), pipeline
lib/repo/                   all SQL access: users, workspaces, apps, records, ai
lib/services/generation.ts  constrained template generation
lib/db.ts                   connection, pragmas, migration runner
lib/api.ts · lib/errors.ts  response envelope, HttpError, same-origin guard
lib/identity.ts             guest/device identity (httpOnly cookie, no sign-in)
migrations/*.sql            schema, append-only
tests/ · e2e/               Vitest units · Playwright acceptance
docker/                     entrypoint (chown the mount, drop to `kanso`) + local smoke test
```

## 6. Conventions

- **Style:** match the surrounding file. TypeScript strict, no `any` in new code, `type` imports
  where the file already does that. Two-space indent, double quotes, trailing commas.
- **Comments** explain *why*, not *what*. The existing code is heavily commented at decision points;
  keep that density rather than adding narration.
- **Client/server:** data loads in the server component; one client component owns UI state. Do not
  add a client store (ADR-7) — mutations return the authoritative document and `router.refresh()`.
- **Styling:** Tailwind v4 utilities plus design tokens; surface theming goes through
  `data-theme` / `data-accent` / `data-density`, never class surgery.
- **Errors:** throw `HttpError` in server code; the envelope in `lib/api.ts` shapes the response.
  Never leak internal messages to the client.
- **Accessibility is part of done:** labelled controls, `aria-sort`/`aria-live`, keyboard paths,
  visible focus, `prefers-reduced-motion`. Charts need their hidden data table.
- **Commits:** imperative, specific, one scope per commit, matching `git log`, e.g.
  `Fix npm ci resolution so the Docker and Render build can install dependencies`.
- **Tests:** change behaviour → change or add the test that pins it. Never weaken an assertion to
  make a suite green; fix the cause.

## 7. Verification ladder (pick the smallest row that covers your change)

| Change | Run at minimum |
| --- | --- |
| Copy, CSS, tokens | `npm run typecheck` + look at the dev server |
| Component/catalog/engine/operations | `npm run typecheck` + `npm test` |
| API route, repo, roles, identity | `npm run typecheck` + `npm test` + `npm run test:e2e` |
| Migration / schema | `npm run db:reset` → `npm run db:migrate` → `npm test` + `npm run test:e2e` |
| AI pipeline / provider | `npm test` + `node scripts/ai-provider-check.mjs` (needs a running server) |
| Docker, entrypoint, deploy | `docker build` + `bash docker/smoke-test.sh`, then check `/api/health` |
| Cross-cutting | full ladder: `typecheck` → `test` → `build` → `test:e2e` |

`npm run typecheck` → `npm test` → `npm run build` (the `verify` job) and `npm run test:e2e`
(the `e2e` job, after `npx playwright install --with-deps chromium`) run in CI on every push and
pull request, next to `migrations` (a database at the previous migration, then the pending files
and `PRAGMA foreign_key_check`), `docker` (image build + `bash docker/smoke-test.sh`) and `audit`
(`npm audit --audit-level=high`) — `.github/workflows/ci.yml`, Node 22, no `GROQ_API_KEY`. The
only row in this table CI still cannot run is the model-key check. `main` is protected: `verify`
and `e2e` are required status checks and admin bypass is disabled, so a red pull request cannot
merge — and a direct push is refused until the checks have run. The `migrations`, `docker` and
`audit` jobs report on every pull request but are not required yet; make them required once they
have stayed green across a few changes. Every change lands as a pull request whose checks are
green.

Report what you actually ran and what you did not. "Not verified" is an acceptable result;
"verified" for something you only compiled is not.

## 8. Environment gotchas on this machine (Windows + Git Bash)

These have each cost time already:

- **The shell exports `PORT=0`.** Never read `$PORT` to pick a host port; set `HOST_PORT` yourself
  and read the real mapping from `docker port`.
- **Git Bash rewrites `/var/data`-style arguments** into `C:/...` before `docker.exe` sees them.
  Prefix the individual docker call with `MSYS_NO_PATHCONV=1`; do not export it globally (it breaks
  `curl`'s `/dev/null` with exit 23).
- **`docker` may not be on `PATH`** in older shells:
  `export PATH="/c/Program Files/Docker/Docker/resources/bin:$PATH"`.
- **LF endings for shell/container files are enforced** by `.gitattributes`. Do not convert them.
- **`npm ci` in `node:22-bookworm-slim` (npm 10.9) is stricter than a modern host npm.** Keep
  `package.json` and `package-lock.json` in sync; `@types/node` is pinned `^22.12.0` because vite 7
  (via vitest) requires it. A lockfile that "works locally" can still fail the image build.
- **Production cookies are `Secure`.** When probing over plain HTTP, send the id as a header:
  `curl -H "Cookie: kanso_device=<id>" ...`, and mint it from the `set-cookie` on `/api/device`.
- **A fresh database legitimately has `users: 1`** — migration `0003` seeds the system owner row
  `usr_shared_owner` that owns the shared workspace (ADR-10). There is no `tasks` table; tasks and
  notes are rows in `app_records`.
- **The image is arm64 locally, Render builds amd64.** Do not claim a Render build is verified from a
  local build.

## 9. Working with other agents (collaboration protocol)

Assume another agent may be editing this repository at the same time.

1. **Claim before you start.** Add or update a row in `agents/tasks.md`: task id, one-line scope,
   your agent name, branch, status (`claimed`), date. If the row already says `claimed` by someone
   else, pick different work or ask the human — do not silently start on it.
2. **One task, one branch.** `agent/<short-slug>` for your work. Do not rebase, force-push or rewrite
   anyone else's branch, and do not commit to `main` while another agent's row is `claimed` in the
   same area.
3. **Stay inside your scope.** Do not reformat, rename or "tidy" files unrelated to your task — that
   is what creates unresolvable conflicts between agents. If you notice an unrelated problem, add a
   row to `agents/tasks.md` instead of fixing it in passing.
4. **Append, never rewrite, in `agents/`.** The task board is the only mutable shared file: touch
   your own row. Log entries are immutable once written.
5. **Hand off in a new file.** When you finish (or stop) create
   `agents/log/YYYY-MM-DD-<short-slug>.md` using the template in `agents/log/README.md`, and set your
   task row to `review` or `done` with a link to it. That file is how the next agent learns what you
   verified without re-running everything.
6. **Docs move with the code.** A behaviour change updates `README.md` (if user-visible), a design
   change adds an ADR in `ARCHITECTURE.md`, and phase status changes update
   `IMPLEMENTATION_PLAN.md` — in the same commit as the code.
7. **Never push, deploy, publish or rotate secrets unless the human explicitly asked for that
   action.** Building and testing locally is always fine; `git push`, Render deploys and publishing
   are the human's call.
8. **Leave the tree usable.** No commented-out code, no `.env` files, no generated artifacts or
   `node_modules` in commits, no leftover containers or servers you started (say how to clean up).

### Handoff summary shape

End your turn with: what you changed (files + why), the exact commands you ran and their result,
what is **not** verified, and the single next action the following agent should take.
