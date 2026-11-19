# PRD — Kanso, the adaptive interface platform

Status: MVP implemented in this repository. Last updated: 18 November 2026.

## 1. Product vision

Software ships one interface to thousands of people, and every one of those people reshapes
their working habits around it. Kanso reverses that relationship: the application's data,
permissions and business logic stay shared and authoritative, while **each person's
interface is generated for them, from plain language, and evolves with them**.

A teammate can say *"move my tasks to the left, add a progress chart on the right, switch to
dark mode"* and the running application changes for them — not for anybody else, not by
someone rewriting the frontend, and not by generating a new app.

## 2. Target audience

Primary (MVP): **small product and operations teams (4–40 people)** already running their work
in one shared tool, where a few people carry non-standard workflows: the PM who lives in a
timeline, the designer who wants a calendar, the founder who wants three numbers and nothing
else. They share tasks, but they do not share a mental model of the screen.

Secondary: internal-tools teams who would otherwise commission one-off dashboards per role.

Not the target for this MVP: enterprises needing SSO/SCIM, regulated industries needing
audited UI change control, or non-technical users wanting a fully bespoke database app with
arbitrary logic.

## 3. Primary user problem

- A fixed layout forces every user to adapt: unused panels take space, the information a
  given person needs is never in the right place, and layout requests enter a design backlog
  they will never reach.
- Per-user settings (themes, sidebars) are limited to the options a product team anticipated.
  Anything structural requires a developer.
- Teams that resort to separate tools per role fragment the data they need to share.

## 4. Unique value proposition

**Your app, your layout — generated from a sentence, isolated per person, safe by construction.**

Three properties together, which the alternatives do not combine:

1. **Runtime interface models, not generated code.** The assistant emits typed operations
   against a validated interface document; the server validates, previews, applies, versions
   and can roll them back. No model-authored JavaScript ever runs.
2. **Per-user isolation by data model.** Interfaces are keyed `(application, user)`, versioned
   per user, and can never alter shared data or another member's view.
3. **One shared application.** Data and permissions are unchanged by personalization; a
   viewer's customization cannot grant them write access.

## 5. Core workflows (MVP)

1. **Generate a workspace** — describe an application; Kanso creates pages, a working task
   model, seeded example data and a starting interface from a constrained template.
2. **Do the work** — create, edit, complete, delete tasks; add shared notes; move tasks across
   statuses; filter and search; change months in the calendar.
3. **Customize in language** — describe a change; the assistant proposes operations, the canvas
   previews the result, and the user applies or discards it.
4. **Customize directly** — toggle edit mode, reorder/resize/hide/remove components, edit
   component settings, switch theme, accent, density and navigation width.
5. **Recover** — version history per user with undo and restore.
6. **Share** — every browser joins one shared workspace automatically (no sign-in for now); each
   person gets their own interface over the same data, and the owner can set roles.

## 6. Competitive positioning

Verified against public positioning of the tools below (November 2026):

| Product | What it does well | Gap for this problem |
| --- | --- | --- |
| Lovable | Generates full-stack applications from prompts; strong editing loop and deployment | Generates **one** application for its owner. Personalizing it per end user is not the product; changing the UI changes it for everyone. |
| Bolt.new | Fast in-browser full-stack generation, strong developer ergonomics | Same shape: produces a codebase, one canonical interface. No per-end-user presentation layer. |
| v0 | Excellent React/Tailwind component and page generation | Output is code the developer ships. The runtime cannot safely restructure itself per user. |
| Retool | Mature internal-tool builder with data connectors, roles and dense admin UI | Powerful app construction; per-user adaptive layout is not the model — role-based access yes, per-person generated interfaces no. |

**Differentiation:** Kanso is not a better app builder. It is the layer *above* an application
that makes its interface a per-user, versioned, validated artifact. The closest comparable
mental model is "user-level theming taken to its structural conclusion, driven by a model and
bounded by a schema."

We do not assume being AI-native is an advantage by itself. The advantage must show up as:
fewer steps to a layout that fits, changes that cannot break the app, and zero cross-user
interference.

## 7. MVP scope (as implemented)

**In scope**

- Anonymous device identities: one httpOnly cookie per browser, no sign-in for now.
- One shared workspace that every guest browser joins as an equal admin — it is owned by a system
  identity rather than a browser, so a cleared cookie cannot orphan it — plus private workspaces you
  own, with roles `owner | admin | member | viewer` and admin role management.
- Application generation from a constrained template set (project workspace, personal tracker),
  including working pages, tasks and notes.
- Real CRUD on task/note records, persisted in the database, filtered and rendered by ten
  functional components.
- Schema-driven interface rendering with nested 12-column layout, stable ids, typed props,
  data bindings, per-page components and responsive rules.
- A constrained operations vocabulary (14 operations) with server validation, atomic apply,
  overlap-free layout packing and revision recording.
- AI pipeline on Groq with timeout, bounded retry, one schema-repair round, rate limiting, audit
  rows, token/latency capture, and a clearly-labelled deterministic fallback when no key exists.
- Visual editing: reorder, resize, reposition, hide, remove, per-component settings, theme,
  accent, density, navigation.
- Per-user interface persistence, preview-before-apply, undo, restore, history.
- Responsive layouts down to 390px, keyboard reachable controls, focus states, reduced-motion
  support, labelled SVGs and tables.
- Unit tests (engine, planner, validation) and a Playwright acceptance suite covering the
  complete scenario including two users and role enforcement.

**Out of scope for this MVP (deliberate)**

- Arbitrary application generation (only constrained templates).
- Continuous behavioural learning / implicit preference inference. Personalization is explicit.
- Real-time collaboration (presence, live cursors).
- SSO, SCIM, email invitations, billing, audit exports.
- Streaming model tokens to the browser (proposal-level streaming is not needed for the loop).
- Postgres deployment topology (see ARCHITECTURE.md ADR-1).

## 8. Success metrics

MVP-level, measurable in this product:

- **Time to first personalization** < 90 seconds from opening an app (target).
- **Proposal acceptance rate** ≥ 60% of generated proposals applied without retry.
- **Validation rejection with recovery**: every rejected proposal leaves the interface intact
  and returns an actionable message (test-enforced).
- **Isolation incidents = 0**: no interface write ever touches another user's document
  (test-enforced by the acceptance suite).
- **Restore success = 100%** of versions restorable and reachable in ≤ 2 clicks.
- **Model cost per edit** tracked per request (`tokens_in`, `tokens_out`, latency) so cost per
  applied change is observable.

## 9. Technical risks and mitigations

| Risk | Mitigation in this build | Remaining exposure |
| --- | --- | --- |
| Model output breaks the UI | Zod-validated operations, capped count/size, atomic apply, final document normalization, preview before apply | Semantically wrong-but-valid layouts; mitigated by preview and history |
| Prompt injection via user text or workspace data | The model sees a restricted render of the interface and the user's sentence only; it has no tools, no data writes, no secrets; system prompt treats request text as data; outputs are still validated | A user can only affect their own interface — blast radius is their own screen |
| Cross-user leakage | Interface documents keyed by `(app, user)`; all queries scoped by workspace membership; restore/undo scoped by user id | None known; tested |
| Model provider outage / rate limits | Bounded retry, timeouts, provider error mapping to specific HTTP codes, per-user budget, deterministic local fallback | Model path unavailable without a key (documented) |
| Cost blow-up | 1–5 operations per request, single repair attempt, per-minute budget, max token cap, audit of token usage | No hard monthly spend cap yet |
| Layout drift / ugly results | Fixed grid with packing, span limits per component, curated default props, design tokens | No visual regression detection yet |
| SQLite concurrency | WAL mode, single-process server | Not multi-region; see ADR-1 |

## 10. Non-goals

- Replacing the application's own permission model.
- Letting users author arbitrary components, scripts or data sources.
- A general-purpose website builder.
- Copying the visual identity of Linear, Vercel, Figma or any other product.
