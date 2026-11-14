# Agile Project — Team Fire

A Scrum-focused project management platform for backlog planning, sprint execution, collaboration, and delivery analytics.

## What is integrated

- The dashboard at `/` is the local Supabase-backed app served from `public/app/` and the Next.js API routes.
- The React App Router sample-data prototype is available at `/prototype`. It uses browser-local demo data and does not authenticate or write to Supabase.
- `dashboard-mockup/` is the original visual reference.
- Database schema, row-level security, and write RPCs live under `supabase/migrations/`.

The connected dashboard is for local development. No hosted Supabase project is configured by this repo.

## Run the connected app locally

Prerequisites: Node.js 24, Corepack with pnpm 12.14, and Docker Desktop running.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
npx supabase start
```

The first Supabase start downloads local Docker images and applies the migrations and seed data. Copy `.env.example` to `.env.local`, then set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local `ANON_KEY` shown by:

```bash
npx supabase status -o env
```

Keep `.env.local` local; it is ignored by Git. Do not use a hosted or production Supabase key here.

Start Next.js:

```bash
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The local seed includes these demo accounts:

| Username | Password | Sample role |
| --- | --- | --- |
| `admin` | `Password123!` | Product Owner |
| `dev1` | `Password123!` | Developer |

These credentials work only with the local seed. To add the optional Sprint 02 sample data after Supabase starts:

```bash
docker exec -i supabase_db_team-fire-scrum psql -U postgres -d postgres < supabase/demo-data.sql
```

The sample-data prototype at [http://localhost:3000/prototype](http://localhost:3000/prototype) can be explored separately without signing in; its changes stay in browser storage.

## API surface

API routes are in `src/pages/api` and use the Supabase session cookie established by the login route.

- `GET /api/health`
- `POST /api/auth/login`, `/logout`, `/change-password`
- Project, work item, membership, sprint, invitation, revision, export, and attachment routes under `/api/projects` and `/api/invitations`

## Development commands

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

`pnpm test` runs the existing sample-data unit tests. The browser check is available with `corepack pnpm browsercheck` after building and starting the app.

## Project documents

- [Requirements](requirements.md) and [architecture](architecture.md)
- [Deployment and recovery](deployment.md)
- [Frontend features](FRONTEND_FEATURES.md) and [startup guide](FRONTEND_STARTUP.md)
- [Team agent rules](AGENTS.md) and [branching model](docs/systems/branching.md)
- [Architecture decision records](docs/adr/)
