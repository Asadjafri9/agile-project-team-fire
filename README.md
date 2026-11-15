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
| `casey` | none yet | invite this account from **Team** to try invitations |

The demo password is shared with assessors outside Git (REL-05). **Explore demo** runs the same interface on browser-local sample data with no account.

## What is integrated

- **Scrum workflow:** backlog with Product Owner ordering, sprint planning with capacity and start pre-checks, a five-column board with WIP warnings, sprint completion with carry-over, and burndown, velocity and cumulative-flow analytics replayed from stored events.
- **Team:** invite existing accounts by username (7-day invitations: accept, decline, revoke), change roles, remove members (their assignments are cleared and logged), leave, transfer ownership, archive a project (read-only afterwards).
- **Work items:** edit every field, checklists, labels, comments with @mentions and notifications, moderation, per-item activity history, archiving with a recorded reason, and file attachments (PDF, PNG, JPEG, text; 10 MB each, per-project budget) in private storage.
- **Exports:** one-click sprint summary as CSV or PDF, built from the same metrics as the dashboard.
- **Security:** Supabase Auth with username sign-up and login (signups validated in the database, so the Auth API can't be used to bypass the rules); row-level security on every table; every write goes through a SQL function that checks identity, project membership and role (requirements §3); attachments are readable only by current members through short-lived signed links.
- **Live updates:** teammates' changes appear within about 4 seconds; edits apply instantly and roll back with a message if the server refuses them.

Anyone can **create an account** from the home page (username, display name, password; see [ADR-014](docs/adr/014-public-signup.md)). A new account starts in no project: create one to become its Product Owner, or ask a teammate to invite your username. Operators can still create, reset or disable accounts with `scripts/accounts.mjs`.

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
BASE_URL=… DEMO_PASSWORD=… node tests/e2e/collab-api.mjs        # invitations, membership, comments, files…
BASE_URL=… SUPABASE_URL=… SUPABASE_KEY=… node tests/e2e/signup-api.mjs   # registration
```

## Operator tasks

```bash
export SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=…
node scripts/accounts.mjs create sana "Sana Iqbal" "QA"     # prints a one-time password
node scripts/accounts.mjs reset sana
node scripts/accounts.mjs disable sana
node scripts/accounts.mjs list
```

## Project documents

- [Requirements](requirements.md) and [architecture](architecture.md)
- [Deployment and recovery](deployment.md)
- [Frontend features](FRONTEND_FEATURES.md) and [startup guide](FRONTEND_STARTUP.md)
- [Team agent rules](AGENTS.md) and [branching model](docs/systems/branching.md)
- [Architecture decision records](docs/adr/)
