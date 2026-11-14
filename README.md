# Agile Project — Team Fire

A Scrum-focused project management platform for backlog planning, sprint execution, collaboration, and delivery analytics.

## What is integrated

- The dashboard at `/` is the React App Router sample-data prototype. It uses browser-local demo data and does not need Supabase or sign-in.
- The database-backed dashboard is at `/app/index.html`; it uses `public/app/` and the Next.js API routes and requires a local Supabase stack.
- `dashboard-mockup/` is the original visual reference.
- Database schema, row-level security, and write RPCs live under `supabase/migrations/`.

The connected dashboard and API are for local development. No hosted Supabase project is configured by this repo.

## Run the sample-data app locally

Prerequisites: Node.js 24 and Corepack with pnpm 12.14.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and choose **Explore demo**. This sample-data UI works without a database; changes stay in browser storage.

## Database-backed dashboard

The integrated dashboard at `/app/index.html` and the API routes need a local Supabase stack. Its schema and seed data are in `supabase/`. Supabase is not required to run the sample-data UI above. If you start the local stack later, use the local API URL and anon key in `.env.local`; do not use hosted or production credentials.


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
