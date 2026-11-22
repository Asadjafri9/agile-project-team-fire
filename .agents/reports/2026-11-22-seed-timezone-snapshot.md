Title:    [DEP] db: seeded sprints have no timezone snapshot after Bolt 002
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend — `supabase/seed-demo.sql:69`, `supabase/migrations/20261122000000_sprint_time_contract.sql`
Severity: low
Labels:   type:dependency, area:backend, sev:low, agent-report

What is wrong:
The Bolt 002 backfill runs during migration. The demo seed runs afterwards on a fresh database and inserts started and completed sprints without `timezone_snapshot`.

Evidence:
All migrations from `backend@0d54350`, then `seed-demo.sql`, on a disposable PostgreSQL 18 database.
Query: `select status, started_at, timezone_snapshot from public.sprints;`

```
COMPLETED 2026-10-27T09:00:00+00:00 null
ACTIVE    2026-11-17T09:00:00+00:00 null
PLANNED   null                      null
```

Impact:
On a freshly seeded environment, Bolt 003 correctly labels these sprints "project setting; not recorded at start", and changing the project timezone would redraw their history. A database seeded before the migration is backfilled and is not affected.

Suggested fix:
Set `timezone_snapshot` for the active and completed sprints in `seed-demo.sql`.

Blocks promotion?: no
