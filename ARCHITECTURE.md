# Architecture

Kanso is a Next.js (App Router) application with a schema-driven interface engine, a
provider-independent AI pipeline and a relational store. This document describes what is
actually implemented in this repository — not an aspirational target.

## 1. System overview

```
┌───────────────────────────────────────────── Browser ─────────────────────────────────────────────┐
│  WorkspaceClient (React)                                                                          │
│   ├─ Sidebar / TopBar              chrome, navigation, appearance                                  │
│   ├─ Surface ── Renderer(REGISTRY) surface document → approved React components                    │
│   ├─ Edit mode + Component settings dialogs                                                       │
│   ├─ AiPanel  (prompt → proposal → preview → apply/discard)                                        │
│   └─ HistoryDrawer (revisions, undo, restore)                                                     │
└───────────────▲──────────────────────────────┬────────────────────────────────────────────────────┘
                │ server components (props)     │ fetch JSON (same-origin)
                │                               ▼
┌───────────────┴─────────────────────────── Next.js server ────────────────────────────────────────┐
│ app/apps/[appId]/page.tsx  →  access check → load interface + records → WorkspaceClient             │
│                                                                                                   │
│ API routes                                                                                        │
│  /api/apps/:id/records                CRUD tasks & notes (role-gated)                              │
│  /api/apps/:id/interface              PATCH validated operations (visual edits)                    │
│  /api/apps/:id/versions               undo / restore                                              │
│  /api/apps/:id/ai                     POST propose · GET request history                           │
│  /api/apps/:id/ai/apply               apply / discard a stored proposal                            │
│  /api/apps/:id/members                membership administration                                    │
│                                                                                                   │
│ Domain modules                                                                                    │
│  interface/{types,catalog,operations,engine,store,service,templates,controls}                      │
│  ai/{provider,prompt,local-planner,pipeline}      repo/{guests,accounts,workspaces,apps,records,ai,rate-limit} │
│  services/generation   identity/sessions   api (error envelope)   db (sqlite + migrations)       │
└──────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                               │ SQL (better-sqlite3, WAL)
                                               ▼
                              SQLite database (.data/kanso.db or DATABASE_PATH)
```

Module rule enforced by construction: **the AI can only produce `InterfaceOperation` objects.**
The renderer has no `eval`, no dynamic imports from user input and no model-authored code path.

## 2. Interface document (the central abstraction)

```jsonc
{
  "schemaVersion": 1,
  "theme": "dark",                 // light | dark
  "accent": "indigo",              // indigo | teal | amber | rose | slate
  "density": "comfortable",        // comfortable | compact
  "nav": { "collapsed": false, "width": "default" },
  "homePage": "overview",
  "pages": {
    "overview": {
      "pageId": "overview",
      "layout": "grid",            // grid | stack
      "components": [
        {
          "id": "cmp_9f2c41ab",     // stable, server-generated
          "type": "TaskBoard",      // one of ten approved components
          "title": "Task board",
          "visible": true,
          "props": { "columns": ["todo","in_progress","done"], "showCompleted": true, "compact": false },
          "layout": { "column": 1, "span": 8 },
          "dataSource": "tasks"     // tasks | notes | activity | null — allowlisted per component
        }
      ]
    }
  }
}
```

Properties that make this safe and durable:

- **Typed props with defaults.** Each component's Zod schema gives every property an explicit
  default, so partial model output is completed rather than rejected wholesale; unknown keys are
  stripped and reported as warnings.
- **Bounded layout.** 12-column grid, per-component `min/maxSpan`, max 12 components per page.
  `packLayouts()` resolves overlaps deterministically, honouring a requested column when free.
- **Data bindings, not data.** Components receive records from the server; a document can never
  reference another application's data, and the binding is validated against the component's
  allowlist.
- **Migration seam.** `normalizeDocument()` upgrades older documents (missing pages, unknown
  component types, invalid enums) into the current shape and reports what it repaired.
- **Per-user scope.** One document per `(app_id, user_id)`. There is no shared mutable UI state.

### Component catalogue (MVP)

`StatSummary`, `TaskBoard`, `TaskList`, `TaskTable`, `Calendar`, `ProgressChart`,
`QuickCreateTask`, `FilterBar`, `NotesPanel`, `ActivityFeed`.

Each catalogue entry declares label, description, category, span bounds, allowed data sources,
default props, a Zod schema and an accessibility contract. `components/workspace/render/registry.tsx`
is the single mapping from type to React component; a `Record<ComponentType, View>` makes a new
catalogue entry a compile error until it is rendered.

### Operation vocabulary (14 operations)

`addComponent`, `removeComponent`, `updateProps`, `moveComponent`, `setVisible`,
`renameComponent`, `reorderComponents`, `setTheme`, `setAccent`, `setDensity`,
`setNavCollapsed`, `setNavWidth`, `setPageLayout`, `setDataSource`.

Applying is **atomic**: any invalid step aborts the entire proposal with a numbered explanation,
so a user never receives a half-applied layout. Operations are capped at 8 per request.

## 3. Data model

SQLite, defined in `migrations/*.sql` and applied by `lib/db.ts` (or `npm run db:migrate`). Files are
never edited once shipped: `0002` added guest identities and `0003` removed the sign-in schema it
superseded (`users.email`, `users.password_hash`, the `sessions` table). Because SQLite cannot drop a
`UNIQUE` column, `0003` rebuilds `users`; the runner applies migrations with foreign-key enforcement
off and runs `PRAGMA foreign_key_check` before recording each file, so such a rebuild cannot cascade
data away or commit a broken reference.

`0004` restores accounts **additively**: it adds `users.email`, `users.password_hash`, a partial
unique index on email and the `sessions` table, and rebuilds nothing. Credentials on the existing row
are enough to make a guest an account (ADR-11), so existing guest rows keep their ids and every
reference to them stays valid.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `users` | Guest device identities and account credentials, plus one system row that owns the shared workspace | unique `device_id`, unique `email` (partial), `is_system` flag |
| `sessions` | Live sign-ins, one row per issued cookie token | PK is the SHA-256 of the token, `user_id` FK, `expires_at` index |
| `workspaces` | Tenancy container | owner FK |
| `workspace_members` | Membership + role | PK `(workspace_id, user_id)`, role check |
| `apps` | Applications | FK workspace, `ON DELETE CASCADE` |
| `app_pages` | Page tabs | unique `(app_id, key)` |
| `app_records` | Tasks and notes (shared data) | FK app, status/priority checks, indexes on app/status/due |
| `interface_definitions` | Base interface per page (generated) | unique `(app_id, page_key)` |
| `user_interfaces` | One personal document per user per app | unique `(app_id, user_id)` |
| `interface_revisions` | Append-only history per user | index `(user_interface_id, created_at)` |
| `ai_requests` | Every proposal/failure audit row | status check, FK app/user, tokens/latency |
| `rate_limit_events` | Sliding-window budgets (AI edits, credential attempts) | index `(bucket, created_at)` |
| `schema_migrations` | Applied migration names | PK name |

`interface_definitions` is what a new member forks from. Deleting an app cascades its pages,
records, interfaces, revisions and AI history.

## 4. Authorization

Resolution path for every app request: `requireAppAccess(appId, userId)` → app → workspace →
membership row → role. There is no client-supplied user or role anywhere.

Before that, `getViewer()` resolves who is calling: a `kanso_session` cookie is checked against
`sessions` first, and only when it is missing or expired does the `kanso_device` cookie resolve a
guest row. Both paths return a real `users.id`, so no authorization check below changed. Signing up
writes credentials onto the guest row the browser already had and clears its `device_id`, which is why
claiming preserves memberships and interface documents without a copy or merge step.

| Capability | owner | admin | member | viewer |
| --- | --- | --- | --- | --- |
| Read shared data | ✓ | ✓ | ✓ | ✓ |
| Create/edit/delete tasks & notes | ✓ | ✓ | ✓ | ✗ (403) |
| Customize own interface / restore versions | ✓ | ✓ | ✓ | ✓ |
| Add/remove members, change roles | ✓ | ✓ | ✗ | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ | ✗ |

Interface personalization is intentionally available to viewers: it is presentation of data they
are already permitted to read, and it is stored against their own user id.

The shared workspace has no browser owner. A system row (`usr_shared_owner`, `users.is_system = 1`)
holds `owner_id`, every guest joins as `admin`, and the system row is filtered out of the roster and
cannot be demoted or removed. This is what keeps the workspace manageable: a guest row is disposable
(the cookie can be cleared, the row stays behind as a stale browser), so management rights attached to
one browser would strand the workspace. `owner` therefore only appears for private workspaces, which
belong to the guest that created them.

## 5. AI pipeline

```
prompt ──▶ rate limit ──▶ load caller's document + page list
                                    │
                     ┌──────────────┴───────────────┐
        GROQ_API_KEY present?                     no
                     │                            │
        buildSystemPrompt + buildUserPrompt   deterministic local planner
                     │                            │
        Groq chat completion (JSON object)        │
                     │                            │
        parse → zod envelope ──fail──▶ one repair round with the error
                     │                            │
                     └──────────► applyOperations ◀┘
                                    │
                         validate + normalize document
                                    │
                    store proposal in ai_requests (status proposed)
                                    │
                  preview in browser → user applies or discards
                                    │
              apply: stale-base check → save revision → status applied
```

Controls implemented:

- **Timeout** via `AbortSignal.timeout` (`AI_TIMEOUT_MS`, default 25s).
- **Bounded retry**: one retry on 5xx/network; never on 429/invalid output.
- **Repair**: at most one additional completion when the JSON fails schema validation; the
  validation error is fed back.
- **Rate limiting**: sliding 60s window per user (`AI_RATE_LIMIT_PER_MINUTE`, default 8).
- **Cost/telemetry**: `latency_ms`, `tokens_in`, `tokens_out`, provider and model stored per
  request, surfaced in the panel.
- **Failure semantics**: nothing is written to the user's interface until apply; failed requests
  are recorded with status `failed` and a safe message; the current interface is untouched.
- **Prompt-injection posture**: the model has no tools, no credentials in the browser, no write
  access, and its output is a closed vocabulary validated server-side. The system prompt
  explicitly treats the request as data. The worst realistic outcome is a bad-but-valid layout in
  the requester's own view, which preview and version history make recoverable.
- **Stale proposal guard**: proposals store the base document; if the interface changed between
  proposal and apply, the apply is rejected with 409 and the user is asked to re-run it.

**Verified model facts.** Groq does not offer a model named "Qwen 3.7". Its Qwen line is
`qwen/qwen3-32b` (stable) with `qwen/qwen3.6-27b` and `qwen/qwen3.8-27b` also listed, alongside
`openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`,
`moonshotai/kimi-k2-instruct` and others. The default is `qwen/qwen3-32b`; `GROQ_MODEL` selects
any Groq-supported id. The provider adapter speaks the OpenAI-compatible chat completions API, so
another provider is a new `completeChat` implementation, not a pipeline rewrite.

## 6. Versioning

- Every saved change appends a row to `interface_revisions` with kind
  `init | ai | manual | restore | undo`, a human label, the full document and the operations.
- The current document is the denormalized `user_interfaces.document` (fast reads) and the newest
  revision (audit trail) written in one transaction.
- **Undo** restores the second-newest snapshot as a new `undo` revision. **Restore** copies any
  earlier snapshot forward as a `restore` revision. History is append-only, so recovery is itself
  recoverable.
- History is per user: restoring cannot affect a teammate's interface.

## 7. Rendering & responsive rules

- Server component loads data and the caller's document; a single client component owns UI state.
- CSS grid, 12 columns desktop, generated `--span` / `--span-md` custom properties for tablet,
  single column under 700px. Kanban columns become a swipeable horizontal rail on phones; wide
  tables scroll inside their card.
- The surface theme is driven by data attributes (`data-theme`, `data-accent`, `data-density`) so
  AI theme changes are pure data, not class surgery.
- Accessibility: `dl`/`table`/`ol` semantics where applicable, labelled controls, `aria-sort`,
  `aria-current`, `aria-live` for counts and status, visible focus rings, keyboard-operable edit
  toolbars, `aria-label` + hidden data table for charts, `prefers-reduced-motion` respected.

## 8. Security summary

- Identity: a guest is an opaque 128-bit device id in an httpOnly, SameSite=Lax cookie (Secure in
  production, 365-day expiry); it is an identity, not an authentication factor. An account adds a
  `kanso_session` cookie (httpOnly, SameSite=Lax, 30-day expiry) whose token is stored only as a
  SHA-256 hash. The session is checked first; a browser with neither cookie is sent to `/api/device`.
- Credentials: scrypt hashes with a per-password salt and a constant-time comparison; an unknown email
  is compared against a dummy hash so timing cannot reveal whether an account exists. Credential
  attempts are counted **before** verification in `rate_limit_events`: sign-in 5 per email and 20 per
  network per 15 minutes; sign-up 3 per email per hour and 20 per network per 15 minutes. All four
  buckets are separate, and the network key is a SHA-256 of `x-forwarded-for`/`x-real-ip` (falling
  back to `unknown`), so no address is stored — but a deployment needs a proxy that sets one header.
- Guest rows and their shared-workspace membership are created server-side only (`resolveGuest`);
  the browser never supplies a user id, and every authorization check still reads a real membership
  row.
- Mutating APIs: same-origin check via `Origin`/`Host`; all inputs parsed with Zod; JSON error
  envelopes without internal details; `cache-control: no-store`.
- SQL: parameterised statements only; no string interpolation of user values.
- Secrets: `GROQ_API_KEY` is read only in server modules; no `NEXT_PUBLIC_` AI variables; the
  browser never sees the key.
- XSS: no `dangerouslySetInnerHTML`; model output is data, never markup or code.

## 9. Architecture decision record

**ADR-1 — SQLite (better-sqlite3) instead of managed PostgreSQL for this build.**
The environment has no database credentials, and the MVP must run reproducibly on one machine.
SQLite gives real persistence, transactions, foreign keys and indexes with zero external service.
The schema is portable SQL and every query lives behind `lib/repo/*`, so the Postgres path is a
driver + placeholder-style change (`?` → `$1`) plus `jsonb` for documents. Trade-off accepted:
single writer, no horizontal scale, no multi-region — documented as a limitation, not hidden.

**ADR-2 — Groq with `qwen/qwen3-32b` as the default model.**
The requested "Qwen 3.7" does not exist on Groq; inventing an id would fail at runtime. The
catalogue was verified against Groq's model docs and the official SDK's typed model list.
`qwen/qwen3-32b` is the stable Qwen option; the model is configuration, not code.

**ADR-3 — JSON object mode + Zod, not structured-outputs strict mode, for operations.**
Operations are a discriminated union with nested optional fields; strict JSON-schema mode adds
provider-specific coupling and does not remove the need for semantic validation. `json_object`
plus Zod plus one repair round is provider-portable and stricter about what actually matters
(allowlisted operations, bounded layout, valid ids). Semantic validation happens after parsing
regardless of how the JSON was produced.

**ADR-4 — Schema + operation engine instead of model-generated React/JS.**
Generating code per user per change is impossible to validate, unsafe to execute and hard to
version or migrate. A constrained document gives preview, undo, diffing, accessibility guarantees
and a blast radius measured in one user's screen.

**ADR-5 — Deterministic local planner as explicit, labelled fallback.**
Without a provider key the product must still be usable and testable. The fallback is a small rule
planner over the *same* operation vocabulary — not a fake model. It is labelled "Local planner · no
API key" in the UI, and the request audit row records provider `local-planner`, so no one can
mistake it for model output.

**ADR-6 — Hand-built primitives on Tailwind instead of pulling shadcn/ui.**
The product needs roughly a dozen primitives (buttons, fields, chips, modal, drawer). Copying the
shadcn registry adds a runtime dependency and config surface for the same markup. Tailwind v4 +
a small component layer keeps the dependency tree at what the app actually uses, with the same
design-token approach.

**ADR-7 — No Zustand / no client data cache.**
The page is served with its full state; the client holds interface state, dialog state and a
proposal. Adding a store would create a second source of truth for the same document. Mutations
return the authoritative document and `router.refresh()` reconciles server components.

**ADR-8 — Custom SVG/CSS charts instead of a charting library.**
Three chart shapes are needed, each with a hand-written accessible table fallback. A charting
dependency would add significant bundle weight for less control over accessibility and theming.

**ADR-9 — Anonymous device identity as the default.**
Sign-in was removed deliberately at that point, to ship a usable shared workspace without an auth
provider; accounts were later restored on top of the same identity (ADR-11), not instead of it.
`GET /api/device` mints a 128-bit id in an httpOnly, SameSite=Lax cookie (Secure in production);
the first request that uses it creates a guest `users` row and joins — or creates — the single
workspace marked `workspaces.is_shared`. Every authorization check still runs against a real
membership row, so roles, 403s and per-person interface documents are unchanged. The trade-off is
explicit: the cookie is an identity, not authentication — anyone with the URL joins, and clearing
cookies starts over. Restoring accounts later means adding a credential check in front of
`resolveGuest`, not rewriting the authorization model.

**ADR-10 — The shared workspace owns itself.**
ADR-9 left the workspace owned by whichever browser arrived first, which was a latent dead end: that
cookie is disposable, so once it was cleared the owner row belonged to a browser that would never
return, and every later guest joined as `member` — nobody could change a role or retire the stale row
again. Ownership is now attached to a non-browser system identity (`users.is_system = 1`) and guests
join as equal admins. Roles still gate behaviour exactly as before (a demoted `viewer` gets 403 on
writes and on member changes), and private workspaces still have a real owner. The rejected
alternatives were inferring ownership from request order or from a "last seen" timestamp, both of
which guess at something the cookie cannot prove.

**ADR-11 — Accounts claim the guest row instead of creating a parallel person.**
Restoring sign-in could have meant a new `accounts` table with guest rows migrated into it, or a
separate person row with a merge step. Both rewrite references (`workspace_members`,
`user_interfaces`, `interface_revisions`, `ai_requests`, `app_records.created_by`) and both create a
window where two rows mean the same person. Instead, credentials live on `users` and sign-up updates
the row the browser already has, clearing `device_id`; signing in resolves that same row through a
session. Nothing is copied, nothing is merged, and a row that never signs up is still a valid guest.
The accepted trade-off is that a claimed row is no longer addressable by device id, so signing out
starts a fresh guest rather than returning to the pre-account identity — correct, because the account
is now the durable identity.

## 10. Request flows (concrete)

**Sign up / sign in** → the `/sign-in` form actions check both credential budgets (email and network)
→ `claimAccount` writes credentials onto the current guest row and clears `device_id`, or
`authenticate` finds the row by email → a session token is minted, stored as a hash and set as
`kanso_session` → redirect to `/dashboard`, where `getViewer()` resolves the account. Sign-out revokes
the session, expires the cookie and revalidates the layout, so the next render is a guest rather than
a cached account view.

**Open an app** → `requireGuest` → `requireAppAccess` (403/404 boundary) → `loadInterface`
(fork from base definition on first visit, record `init` revision) → load tasks/notes/activity/
history/members → render.

**Visual edit** → client `PATCH /api/apps/:id/interface` with operations → server re-checks
membership → `applyInterfaceOperations` → engine validates + normalizes → revision written →
response document replaces canvas state.

**AI change** → `POST /api/apps/:id/ai` → budget → provider or planner → `applyOperations`
(validates the *whole* result before it exists anywhere) → audit row → response proposal →
client previews locally → `POST /api/apps/:id/ai/apply` → stale-base check → revision `ai` →
status `applied` → refreshed document.

**Share** → every guest browser resolves to a membership row on first visit (the workspace is owned by
a system identity, so each guest joins as an admin and no browser can orphan it) → the shared
workspace lists the app in their dashboard, and their first open forks the base interface.
`PATCH /api/apps/:id/members` changes roles behind an admin check.
