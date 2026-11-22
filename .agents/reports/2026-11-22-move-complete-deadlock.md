Title:    [INTEG] be: card move and sprint completion can deadlock
Found by: claude-code/frontend on fe/SPR-01-sprint-timeline-ui@0c6f9cc
Affects:  Backend — `supabase/migrations/20261115000000_integration_hardening.sql:333,491,508`
Severity: medium
Labels:   type:integration, area:backend, sev:medium, agent-report

What is wrong:
The two RPCs lock in opposite orders.

- `rpc_complete_sprint` locks the project `FOR UPDATE`, then the sprint.
- `rpc_move_work_item` locks the sprint `FOR SHARE`, then needs a key-share lock on the project for the foreign key of `work_item_status_history`.

ADR-012 specifies project, then sprint.

Evidence:
Reproduced with unmodified RPCs on a disposable PostgreSQL 18 database with all migrations from `backend@0d54350` and `seed-demo.sql`. Run in three `psql` sessions, about 0.5 seconds apart:

```sql
-- A: hold the item briefly so the move waits while holding the sprint lock
begin; select 1 from public.work_items where key='FIRE-104' for update; select pg_sleep(2.5); commit;

-- B: as the Product Owner
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',false);
select public.rpc_move_work_item((select id from public.work_items where key='FIRE-104'), 'Testing');

-- C: as the Scrum Master
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',false);
select public.rpc_complete_sprint('b0000000-0000-4000-8000-000000000002');
```

Output of B: `ERROR:  deadlock detected`. C completes. With other timing, C can be the victim instead.

Impact:
SPR-07 requires a useful conflict response. The user gets a failed move or completion, and `httpError` maps SQLSTATE 40P01 to a generic 400. No data is corrupted because the losing transaction rolls back.

Suggested fix:
In a new migration, make the move take `FOR KEY SHARE` on the project before locking the sprint. Map 40P01 to 409.

Blocks promotion?: no
