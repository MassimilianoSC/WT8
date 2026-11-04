# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**PracticeHub** — a Next.js 14 (App Router) full-stack app, backed by MongoDB, that manages the practices
(telecom site cases) of six clients (ILIAD, TOWERNET, TIM/FIBERCOP, INWIT, FASTWEB/VODAFONE, LEONARDO), worked
by four groups: **PM/Permessi, UT/PE, AIE, DL**. Each client has its own **template** (compiled from the
requirements baseline), each practice has **iterations**, and each group fills its own sections. One Next.js
server owns both the UI and the `/api/*` route handlers; a separate **worker** process runs alerts, mail
delivery (outbox), the nightly export and the health heartbeat.

The requirements and every decision live in `docs/`:
- `docs/baseline/2026-10-08/` — functional baseline (Guida v8 + per-client field mappings). Authoritative.
- `docs/coordinamento/` — decisions register (`DECISIONI.md`, D-n), data contract (`CONTRATTO_DATI.md`),
  open work (`LAVORI_APERTI.md`), production plan (`PIANO_PRODUZIONE.md`), cutover (`CUTOVER.md`).
- `docs/guida/` — user guide and acceptance checklist.

All real code lives in `frontend/`; deployment lives in `deploy/`.

## Working model (three sessions)

Work is split between three Claude Code sessions: **memory/coordination** (owns `docs/`, decisions and the
contract, never code), **o2** (backend: `src/app/api`, `src/services`, `src/lib`, `src/data`, `src/jobs`,
`scripts`, `deploy`, `lib/contract.ts`) and **o3** (frontend: `src/components`, `src/app` pages, styles,
`lib/client.ts`). They talk via SendMessage. A contract change goes first in `CONTRATTO_DATI.md` (memory),
then in `lib/contract.ts` (o2) — never the other way round. Commit by path with the session label
(`[o2]`, `[o3]`, `[memoria]`); never `git add -A`.

## Commands (from `frontend/`)

```bash
yarn dev:anteprima          # local preview on a disposable Mongo (ports 3200/27018); stop with yarn anteprima:stop
yarn worker                 # worker process (alerts, outbox mail, export, heartbeat)
yarn typecheck              # tsc, incremental
yarn lint
yarn test                   # vitest (all)
yarn test:server:completo   # server suite, 2 files in parallel (needs a disposable replica set, MONGO_RS_TEST_URL)
yarn build                  # production build (fails on TS errors)
yarn templates:compile | templates:check | templates:diff   # templates from the baseline
yarn db:backup | db:verify | db:restore                     # guarded backup tools
```

Production/acceptance stack: `deploy/compose.yml` (app, worker, backup, MongoDB replica set on internal port
27018, Caddy HTTPS proxy on 8443) driven only with `docker compose -f deploy/compose.yml --env-file deploy/.env`;
updates with `deploy/aggiorna.ps1`, rollback with `deploy/torna-indietro.ps1`. See `deploy/README.md`.

### Testing rules (D-164, D-174, D-175, D-176)
- Each delivery: only the tests of touched files, the modules that import them (`vitest related`), tests that
  read files from disk, plus `yarn typecheck` **once** before the commit.
- Full run (typecheck, lint, server suite, frontend suite, docker build) **only when the memory session asks**
  (end of a block, before an install). After a fix, re-run only the failed test — never the full run again.
- Deliberate-fault tests only on data protection, backup/restore, login/security, transactions, engines.
- Read-only sub-agents may be used freely; never for writing or committing.

## Hard safety rules
- **Never** write to, test against or preview on the beta database (port **27017**, DBs `practicehub`,
  `practicehub_v2`) or on `practicehub_prod`; tests and previews use disposable Mongo containers only.
  Scripts refuse those targets (D-158); never bypass the guards or a denied permission.
- **Never** run `docker compose up --build` at the repository root: it would rebuild the old beta (D-161).
- Never touch other company containers on the machine (intranet nginx on 80/443, other apps).
- No secrets in the repo: `deploy/.env` and keys under `D:\PracticeHub\segreti\` stay out of git.
- The demo seed never runs on production; no startup may delete or rewrite existing data (PR-04).

## Architecture

- **Route handlers** (`src/app/api/**/route.ts`) are thin: `handle()` from `lib/api.ts`, the current user from
  `lib/auth-v2.ts` (`requireCurrentUser`, re-read by id from the DB on every request), body validation with
  `parseBody` + Zod (`lib/validators.ts`), then a service. `runtime = "nodejs"`, `dynamic = "force-dynamic"`.
- **Services** (`src/services/*`, `practices-v2/*`, `import-v2/*`, `assistant/*`) hold the business logic and
  throw `HttpError(message, status)`; they read/write Mongo through `lib/store/*` and map to the DTOs of
  `lib/contract.ts`.
- **Store** (`lib/store/db.ts`): typed collections, indexes and base data (never demo data); writes go through
  `lib/store/transaction.ts` (`runOperation` with `operationId`, practice-wide revision CAS), outbox for mail
  (`lib/store/outbox.ts`, delivered by the worker).
- **Engines** (`lib/engines/*`): conditions, formulas, state, rows, progress and **access** (field- and
  group-level permissions from `src/data/access-policy.json`); alerts in `lib/alerts/*` + `services/alerts-*`.
- **Templates**: compiled JSON in `src/data/templates/` (do not hand-edit: regenerate with
  `templates:compile`); lists, bindings and rules in `src/data/*.json`.
- **Auth**: NextAuth v5, Credentials + JWT; the token carries only `{ id, name, email, isAdmin }`.
  Memberships, status and `mustChangePassword` are always re-read from the DB. First ADMIN created from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` only if none exists, with forced password change (D-173). Login attempts
  limited per email (PR-22).
- **Assistant AI** (`services/assistant/*`, contract §13): read-only tools over the user's own permissions,
  NDJSON streaming, Gemini Flash on an EU Vertex/Agent Platform region (D-165…D-172).
- **Client fetch** (`lib/client.ts`, `apiFetch`): same-origin relative paths with credentials.

### Authorization in one line
ADMIN is a user flag (`isAdmin`), not a group role; everyone else acts through memberships (client ×
group × role, team leader flag). The rules are in `DECISIONI.md` and `access-policy.json` — read them before
changing anything that decides who can see or edit what (D-121 for Note Operative).

### UI conventions
- `src/app/(app)/` is the authenticated area (server-side guard + forced password change redirect);
  `(account)` hosts `/change-password`; `/login`, `/forgot-password`, `/reset-password`, `/set-password` are
  public. All user-facing text is Italian.
- `src/components/ui/*` are shadcn/ui primitives; feature components live in sibling folders.
- Swiss / high-contrast design: border-radius 0, 1px borders, signal status colors.
- Path alias `@/*` → `./src/*`.
