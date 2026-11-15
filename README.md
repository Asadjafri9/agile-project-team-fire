# Agile Project — Team Fire

A Scrum-focused project management platform for backlog planning, sprint execution, collaboration, and delivery analytics.

**Live:** https://team-fire-agile.vercel.app

## Using the live site

Sign in on the home page with one of the demo accounts. Each holds a different role in the **Team Fire** project, so you can see role-based access from every side:

| Username | Role | Can |
| --- | --- | --- |
| `ayesha` | Product Owner | everything, including backlog ordering |
| `hamza` | Scrum Master | plan, start and complete sprints; move cards |
| `zara`, `bilal` | Developer | create and edit items, move cards |
| `assessor` | Viewer | read everything, change nothing |

The demo password is shared with assessors outside Git (REL-05). **Explore demo** runs the same interface on browser-local sample data with no account.

## What is integrated

- **Frontend:** Next.js App Router workspace (overview, backlog, sprint planning, board, analytics, team). In live mode every action is applied optimistically and confirmed by the server; failures roll back with a message. Teammates' changes appear within about 4 seconds.
- **API:** `GET /api/workspace` and `POST /api/actions` ([contract](docs/api/workspace.md)), plus the per-resource routes under `/api/projects`.
- **Database:** Supabase Postgres with row-level security on every table. All writes go through role-checked SQL functions; status history, scope changes and sprint commitments are recorded for analytics (`supabase/migrations/`).
- **Auth:** Supabase Auth with username login, cookie sessions, and public signup disabled.

Not in this release (routes answer `501`): invitations, member role changes, archiving, attachments, PDF export. See the [integration log](docs/systems/integration-log.md).

## Run locally

Prerequisites: Node.js 24 and Corepack with pnpm 12.14.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Without Supabase settings the app runs in sample-data mode. For live mode, create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Only the public URL and publishable key are used. The service-role key is never needed.

## Database setup

Hosted project (Systems Architect only; see AGENTS.md §4):

```bash
SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node scripts/apply-hosted.mjs inspect
SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… DEMO_PASSWORD=… node scripts/apply-hosted.mjs apply
```

This applies unrecorded migrations, seeds `supabase/seed-demo.sql`, disables public signup, and verifies RLS on every table.

## Tests

```bash
corepack pnpm typecheck
corepack pnpm test                       # unit tests
psql "$DB_URL" -f supabase/tests/rpc_security.test.sql          # database permissions
BASE_URL=… DEMO_PASSWORD=… node tests/e2e/rbac-api.mjs          # auth + RBAC end to end
```

## Project documents

- [Requirements](requirements.md) and [architecture](architecture.md)
- [Deployment and recovery](deployment.md)
- [Frontend features](FRONTEND_FEATURES.md) and [startup guide](FRONTEND_STARTUP.md)
- [Team agent rules](AGENTS.md) and [branching model](docs/systems/branching.md)
- [Architecture decision records](docs/adr/)
