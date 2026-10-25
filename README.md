# Agile Project — Team Fire

A Scrum-focused project management platform for backlog planning, sprint execution, collaboration, and delivery analytics, based on [the project WBS](WBS_Agile_PM_Platform.pdf).

> **Status:** the backend API, database schema and a locally integrated dashboard are implemented. The production frontend (TypeScript + App Router per `architecture.md`) is still to be built; `agile-project-team-fire-frontend/dashboard-mockup/` is the design reference used for the local demo.

| Document | Contents |
| --- | --- |
| [requirements.md](requirements.md) | Scope, role matrix, acceptance criteria, metric formulas, concurrency/security targets, WBS traceability, delivery gates. |
| [architecture.md](architecture.md) | Recommended stack, diagrams, data model, transaction/permission design, API sketch, architecture decisions. |
| [deployment.md](deployment.md) | Supabase Free + Vercel setup, CI/CD ordering, secrets, free-plan constraints, backup/restore, assessment checklist. |
| [AGENTS.md](AGENTS.md) | **Binding rules for every AI agent and human**: roles, branch permissions, path ownership, issue reporting, human-in-the-loop gates. |
| [docs/systems/branching.md](docs/systems/branching.md) | Six-branch model, allowed PR flows, release cycle, one-time GitHub/Supabase/Vercel setup. |
| [docs/systems/architecture-review.md](docs/systems/architecture-review.md) | Architecture review findings and their resolutions. |
| [docs/adr/](docs/adr/) | Architecture Decision Records (ADRs) 011–013; ADRs 001–010 are summarised in architecture.md §10. |

---

## Run it locally (end to end)

Everything runs on your machine: Next.js serves both the API and the dashboard, and Supabase (in Docker) provides PostgreSQL, Auth and Storage. No cloud account or keys are needed.

### Prerequisites

| Tool | Version used | Notes |
| --- | --- | --- |
| Node.js | 22.11 (18+ works) | `node -v` |
| npm | 10.x | ships with Node |
| Docker Desktop | running | Supabase containers need it |
| Supabase CLI | used via `npx` | no global install required |

Ports used: `3000` (app), `54321` (Supabase API), `54322` (Postgres), `54323` (Studio), `54324` (Mailpit).

### 1. Install dependencies

```bash
npm install
```

### 2. Start the local database

```bash
npx supabase start
```

The first run pulls Docker images (a few minutes). Every start applies the migrations in `supabase/migrations/` and the mock accounts in `supabase/seed.sql`. When it finishes it prints `API_URL`, `ANON_KEY`, etc.

### 3. Point the app at it

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

Then put the real values in `.env.local`:

```bash
npx supabase status -o env
```

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the ANON_KEY printed above>
```

`.env.local` is git-ignored — never commit it.

### 4. Add the demo sprint and work items (recommended)

`supabase/seed.sql` creates the accounts, project and members. This extra file adds a full "Sprint 02" plus backlog items so the dashboard has data:

```bash
# macOS / Linux
docker exec -i supabase_db_team-fire-scrum psql -U postgres -d postgres < supabase/demo-data.sql

# Windows PowerShell
Get-Content supabase/demo-data.sql -Raw | docker exec -i supabase_db_team-fire-scrum psql -U postgres -d postgres
```

> `npx supabase db reset` wipes this demo data — re-run the command above afterwards.

### 5. Start the app

```bash
npm run dev
```

Open **http://localhost:3000** — it redirects to the dashboard at `/app/index.html`.

### 6. Sign in

| Username | Password | Role in the sample project |
| --- | --- | --- |
| `admin` | `Password123!` | Product Owner |
| `dev1` | `Password123!` | Developer |

These accounts exist **only in the local seed** (`supabase/seed.sql`).

### What to try

1. **Overview** — stats, burndown, velocity and "needs your attention" are computed from Postgres, not hardcoded.
2. **Sprint board** — drag a card between columns, or open a card and change its status. The change is persisted through `POST /api/projects/:id/items/move` → `rpc_move_work_item` (optimistic version check + status history).
3. **Product backlog** — search/filter items; **+ New work item** inserts through `rpc_create_work_item`.
4. **Team** — membership and roles from `project_members`.
5. **Supabase Studio** — http://127.0.0.1:54323. Watch `work_items.version`, `work_item_status_history` and `project_revisions.board_revision` update as you click.

---

## API

All routes live under `src/pages/api` and authenticate with the Supabase session cookie set by `POST /api/auth/login`.

| Method + path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness + database reachability |
| `POST /api/auth/login` · `/logout` · `/change-password` | Username/password auth (internally `username@accounts.team-fire.invalid`) |
| `GET`/`POST /api/projects` | List projects for the caller / create a project (RPC) |
| `GET`/`PATCH /api/projects/:projectId` | Project details / archive |
| `GET`/`POST /api/projects/:projectId/items` | Work items / create (RPC) |
| `GET`/`PATCH /api/projects/:projectId/items/:itemId` | Item detail / edit |
| `POST /api/projects/:projectId/items/move` | Persist a board move (RPC, versioned) |
| `POST /api/projects/:projectId/items/attachments` | Attachment upload to private storage |
| `GET`/`PATCH`/`DELETE` `/api/projects/:projectId/members` | Membership management |
| `GET`/`POST /api/projects/:projectId/sprints` | Sprints / create |
| `POST /api/projects/:projectId/sprints/:sprintId/start` · `complete` · `scope` | Sprint lifecycle (RPC) |
| `GET /api/projects/:projectId/sprints/:sprintId/analytics` | Scope/velocity analytics |
| `GET /api/projects/:projectId/revisions` · `export` | Board revision counter / CSV export |
| `POST /api/invitations/:invitationId/accept` | Accept an invitation |

## Project layout

```
src/pages/api/           Next.js API routes (auth, projects, items, sprints, members…)
src/lib/supabase/        Server/client Supabase helpers (cookie-based sessions)
src/middleware.js        Refreshes the Supabase session on every request
src/pages/index.js       Redirects / to the integrated dashboard
public/app/              Local integration layer: dashboard mockup wired to the live API
supabase/migrations/     Schema, RPCs and RLS policies (forward-only)
supabase/seed.sql        Local accounts, profiles, sample project + members
supabase/demo-data.sql   Optional demo sprint and work items
agile-project-team-fire-frontend/
                         Design reference (docs + static dashboard mockup)
```

### Security model

- Every exposed table has RLS enabled; reads are limited to project members (`is_member(auth.uid(), project_id)`).
- Direct `INSERT`/`UPDATE`/`DELETE` on domain tables is revoked from `anon`/`authenticated`; writes go through `SECURITY DEFINER` RPCs.
- The service-role key is never used in request-handling code.
- Attachments live in the private `project_attachments` bucket.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `email_provider_disabled` (422) on login | `[auth.email] enable_signup` in `supabase/config.toml` must be `true` (it enables the email **provider**; public signup is still blocked by `[auth] enable_signup = false`). Restart with `npx supabase stop && npx supabase start`. |
| Login returns 500 `Database error querying schema` | Seeded `auth.users` rows are missing `created_at`/`aud`/`role`/identities. The committed `seed.sql` already handles this; re-run `npx supabase db reset`. |
| `GET /api/projects` returns `{"data":[]}` | Missing RLS policies on `project_members`/`profiles` — fixed by migration `20261021000002_rls_read_policies.sql`. |
| `500` + `Module not found: Can't resolve '../../../../lib/...'` | Import depth in a nested API route; imports resolve to `src/lib`. |
| `docker ps` shows nothing / start hangs | Start Docker Desktop and retry `npx supabase start`. |
| Port 3000 already in use | `npm run dev -- -p 3001` (the dashboard uses relative API paths, so it keeps working). |

## Branch

This work is published on `integrated_front_backend`. Per `AGENTS.md`, integration changes merge into `agentic-integration` through a pull request — never directly into `main` or `testing`.
