# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**PracticeHub** — a single Next.js 14 (App Router) full-stack app that manages "practices"
(telecom site cases: one practice = **sito + gestionale/operatore**) worked by five real teams —
**PM, DL, PM/Permessi, AIE, UT + PE** — through a **free pipeline**: no fixed order, any team can
pass a practice to any other ("Passa a…") and completion is an explicit action.
One Next.js server owns **both** the UI and the `/api/*` route handlers, backed by MongoDB.

**All application code lives in `frontend/`**; deployment lives in `deploy/`.
`frontend/README.md` is a stale Create-React-App default — ignore it; the root `README.md`
is authoritative.

## Commands (run from `frontend/`)

Yarn is the documented package manager (see Dockerfile / root README), though a `package-lock.json`
is also present.

```bash
yarn dev            # dev server on http://localhost:3000 (also the `start` script — NOT production)
yarn build          # production build (fails on TS errors; lint errors are ignored — see next.config.js)
yarn start:prod     # run the production build
yarn lint           # next lint (eslint) — kept as a separate step, does not gate the build
```

Full stack via Docker (from repo root): `docker compose up --build` — brings up the app + MongoDB
and seeds the DB on first launch.

### Tests
Tests use **vitest** (config `frontend/vitest.config.mts`); suites live in `frontend/tests/` and in
`__tests__/` folders next to the components.

```bash
yarn test                    # vitest run
yarn test:watch              # vitest in watch mode
yarn test:server:completo    # full server suite (tests/server, 2 workers)
```

## Architecture

The request path is layered and consistent — read these together to understand it:

- **Route handlers** (`src/app/api/**/route.ts`) are thin. They wrap logic with `handle()` from
  [lib/api.ts](frontend/src/lib/api.ts) (which turns thrown `HttpError` into JSON responses), gate
  access with `getSessionUser()`, validate the body with `parseBody(req, zodSchema)`, then delegate
  to a service. Handlers set `export const runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- **Services** (`src/services/*`) hold all business logic. They read/write Mongo through the typed
  `collections` accessors, convert documents to DTOs via [lib/mappers.ts](frontend/src/lib/mappers.ts),
  and signal failures by throwing `HttpError(message, status)`.
- **DB layer** ([lib/db.ts](frontend/src/lib/db.ts)) caches a single `MongoClient` on the Node global
  (survives hot-reload). `getDb()` runs idempotent setup **once per process**: index creation + DB
  seeding. It also defines the raw `*Doc` shapes (with `ObjectId`) — these are **server-only**; never
  send them to the client, always map to DTOs first.
- **Auth** ([lib/auth.ts](frontend/src/lib/auth.ts)) is NextAuth (Auth.js v5), Credentials provider +
  JWT sessions (no server-side session store). `role` and `team` are embedded in the token and exposed
  on `session.user` for authorization. Adding another provider = add it to `providers`, no other change.
- **Client fetch** ([lib/client.ts](frontend/src/lib/client.ts)) `apiFetch()` uses same-origin relative
  paths with `credentials: "include"` so it works locally and behind a reverse proxy.

### Domain model & authorization rules
- A **practice** carries a per-team section map (`teams: Record<TeamId, TeamSectionDoc>`) plus a
  top-level `currentTeam`, `currentStatus` and `gestionale` (source system/operator). Each section
  holds notes/status/assignee **and** `fields: Record<fieldKey, string>` — the schema-driven values.
- **Schema-driven fields:** [lib/registry.ts](frontend/src/lib/registry.ts) loads
  `src/data/registro_campi.json` (418 field definitions extracted from the mapping workbook:
  label→slug key, section, type text/date/number, owning teams, core flag). It is the sync source
  for UI rendering and progress totals; the `field_defs` Mongo collection is seeded from it on
  startup (upsert). Per-team **progress** (`filled/total`) is computed in `toPracticeDTO`.
- **Free pipeline:** `passToTeam(id, actor, target)` moves a practice to ANY team;
  `completePractice(id, actor)` closes it (both in
  [services/practices.ts](frontend/src/services/practices.ts)). The `transition_rules` collection
  restricts targets per source team **only when rows exist** (empty = everything allowed —
  constraints are data, not code).
- **Authorization:** an *admin* may edit the current stage of any practice; a *user* may edit only their
  own team's section, and only while `practice.currentTeam === user.team`. A user's
  `managedGestionali` is a **filter default only** (set at invite and in Impostazioni), never a
  permission.
- **Auditability:** every mutation writes an audit-log entry and/or a timeline event (including each
  changed schema field), and team hand-offs fire notifications (in-app + email). When adding a
  mutation, follow this pattern.
- **Excel import** (admin, `/import`): [services/import.ts](frontend/src/services/import.ts) maps
  workbook headers to field keys via `src/data/alias_gestionali.json` (50 per-sheet profiles from
  the mapping workbook), then upserts practices on the site identity (**Codice G7**, fallback
  Codice Sito) per gestionale.

### Single-file extension points
- New domain value (team / status / gestionale) → [lib/constants.ts](frontend/src/lib/constants.ts). This
  is the single source of truth (`TeamId`, `PracticeStatus`, `GESTIONALI_BY_TEAM`); services, mentions
  (`lib/sanitize.ts` derives aliases from `TEAM_IDS`) and UI derive behavior from it. The `status.*`
  Tailwind tokens in `tailwind.config.ts` mirror `STATUS_COLOR` here — keep the two in sync.
- New/changed **fields** → regenerate `src/data/registro_campi.json` (and
  `src/data/alias_gestionali.json` for import) from the mapping workbook; the DB registry re-syncs at
  startup. Do not hand-edit field keys: they are `slugifyFieldKey(label)`.
- New API endpoint → add `src/app/api/**/route.ts` + a function in `src/services/*`.
- New collection → add a typed accessor in `collections` + an index in `ensureIndexes` (both in `lib/db.ts`).
- New Zod schema → [lib/validators.ts](frontend/src/lib/validators.ts) (shared by client and server).

### Routing & UI conventions
- The `src/app/(app)/` route group is the authenticated area; its `layout.tsx` is a **server-side guard**
  that redirects to `/login` when there is no session. Public auth screens (`/login`, `/forgot-password`,
  `/reset-password`, `/set-password`) live outside the group.
- `src/components/ui/*` are shadcn/ui primitives; feature components live in sibling folders.
- Design system is Swiss / high-contrast: border-radius `0`, 1px structural borders, signal status colors.
- Path alias `@/*` → `./src/*`.

## Environment & seeding
Config is read from env (`MONGO_URL`, `DB_NAME`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `SMTP_*`); `docker-compose.yml` supplies defaults, overridable via a root `.env`.
`.env` files are gitignored — do not commit secrets.

- The **admin account is seeded and its password re-synced to `ADMIN_PASSWORD` on every startup**; the
  five per-team demo accounts (`pm@`, `dl@`, `permessi@`, `aie@`, `utpe@practicehub.local`) are also
  re-synced every startup; mock users + ~64 practices are seeded only when the practices collection is
  empty. `seedDatabase` also runs a **one-shot migration** from the legacy "Team A/B/C" placeholder
  data and re-seeds the `field_defs` registry (see `services/seed.ts`).
- **Email** (Nodemailer): if `SMTP_HOST` is empty, invitation/reset **links are printed to the server
  console** instead of sent — every auth flow is fully testable without a mail server.
