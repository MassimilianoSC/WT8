# PracticeHub

A unified data-management platform for teams working on the same **practices**
(business cases / tickets) at different stages of a pipeline: **Team A – Data
Entry → Team B – Verification → Team C – Approval**.

Built to be production-ready from day one: modular architecture, clear
separation of concerns, typed end-to-end, and easy to extend.

## Tech Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Framework  | Next.js 14 (App Router) + TypeScript         |
| UI         | shadcn/ui + Tailwind CSS (Swiss/brutalist)   |
| Auth       | NextAuth.js (Auth.js v5) — Credentials + JWT |
| Database   | MongoDB (official Node driver)               |
| Email      | Nodemailer (SMTP, configurable)              |
| Charts     | Recharts                                     |
| Validation | Zod (client + server)                        |

## Project Structure

```
frontend/
├── Dockerfile
├── .env.example
└── src/
    ├── app/               # App Router: pages + /api route handlers
    │   ├── (app)/         # Authenticated area (dashboard, analytics, users…)
    │   ├── api/           # RESTful API + NextAuth handler
    │   ├── login/ …       # Public auth screens
    │   └── layout.tsx
    ├── components/        # UI + feature components (ui/ = shadcn primitives)
    ├── lib/               # db, auth, email, validators, utils, api helpers
    ├── models/            # (document typing lives in lib/db.ts collections)
    ├── services/          # Business logic (practices, users, stats, seed…)
    └── types/             # Shared DTO + NextAuth type augmentation
docker-compose.yml         # app + mongo (repo root)
```

### Where to add new functionality
- **New API endpoint** → add a route handler under `src/app/api/…/route.ts`
  and put the logic in a `src/services/*` function.
- **New domain value** (team/status/client) → edit `src/lib/constants.ts`.
- **New auth provider** → add it to `providers` in `src/lib/auth.ts`.
- **New collection** → add a typed accessor in `src/lib/db.ts` (`collections`).

## Running with Docker (recommended)

```bash
cp frontend/.env.example frontend/.env      # optional: adjust values
docker compose up --build
```

- App: http://localhost:3000
- MongoDB: mongodb://localhost:27017 (persisted in the `mongo_data` volume)

The database is **seeded automatically on first launch** (admin account + mock
practices/users). Configuration is read from environment variables set in
`docker-compose.yml` (override via a root `.env` file).

## Running locally without Docker

Prerequisites: Node.js 20+, Yarn, a running MongoDB.

```bash
cd frontend
cp .env.example .env         # set MONGO_URL, AUTH_SECRET, etc.
yarn install
yarn dev                     # http://localhost:3000
```

For a production build:

```bash
yarn build && yarn start:prod
```

## Initial admin user

Seeded automatically from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults:
`admin@example.com` / `Admin@12345`). The admin password is re-synced with the
env values on every startup, so changing them and restarting updates the admin.

## Configuring SMTP (email)

Invitations, password resets and welcome emails are sent via Nodemailer.

- **Development / no SMTP:** leave `SMTP_HOST` empty. Emails (including the
  invitation / reset **links**) are printed to the server console so every flow
  is fully testable without a mail server.
- **Real SMTP:** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_SECURE` and `SMTP_FROM` in `.env`.

## Features

- Email/password auth, forgot/reset password, change password.
- Invitation flow (admin invites → email link → user sets password, 24h expiry).
- Dashboard: searchable, filterable, paginated practices table.
- Practice detail: **My Team** (editable) · **Other Teams** (read-only) ·
  **Timeline**, plus threaded comments with @mentions and a collapsible audit log.
- "Pass to Next Team" workflow action with automatic timeline/audit updates.
- Analytics: KPI cards + bar/line/pie charts (Recharts) with filters.
- Admin user management (invite, deactivate, status).
- Light/dark themes, responsive, accessible, toast notifications, skeletons.

## Roles

- **Admin** — invites users, sees all practices, edits the current stage, manages settings.
- **User** — sees all practices; can edit only practices currently at their team.
