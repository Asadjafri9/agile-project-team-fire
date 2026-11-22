Title:    [CONTRACT] be: sprint completion takes its cutoff before it gets the locks
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend — `supabase/migrations/20261115000000_integration_hardening.sql:324,333`
Severity: high
Labels:   type:contract, area:backend, sev:high, agent-report

What is wrong:
`rpc_complete_sprint` sets `v_now := clock_timestamp()` in `DECLARE`, then waits for the project, sprint and item locks. A change that commits during that wait is counted in the stored result, but its event is timestamped after the stored cutoff.

Evidence:
Reproduced with unmodified RPCs on a disposable PostgreSQL 18 database with all migrations from `backend@0d54350` and `seed-demo.sql`. Run in three `psql` sessions, about 0.5 seconds apart:

```sql
-- A: hold one item of the active sprint briefly
begin; select 1 from public.work_items where key='FIRE-104' for update; select pg_sleep(2.5); commit;

-- B: as the Product Owner (takes the project lock, then waits for A)
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
select public.rpc_allocate_item((select id from public.work_items where key='FIRE-104'), null, 'Scope reduced');

-- C: as the Scrum Master (takes v_now, then waits for B)
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',false);
select public.rpc_complete_sprint('b0000000-0000-4000-8000-000000000002');
```

Both RPCs succeed, and the removal falls after the cutoff:

```
cutoff|removal_at|event_after_cutoff
2026-11-22 22:39:19.656342+05|2026-11-22 22:39:20.870589+05|t
```

Impact:
SPR-07, MET-01 and REL-01 fail. The frozen result and a replay at the frozen cutoff disagree, so the summary and the burndown can show different numbers. The frontend cannot repair this without guessing which late events were included.

Suggested fix:
In a new migration, assign `v_now := clock_timestamp()` after the last lock is acquired. Optionally also store the cutoff sequence, as requirements section 5.9 asks.

Blocks promotion?: no. This predates Bolt 003, but should be fixed before completed reports are used as evidence.
