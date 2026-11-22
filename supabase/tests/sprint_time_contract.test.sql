
-- Bolt 002 / FR-3. Run on a disposable local database after all migrations:
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sprint_time_contract.test.sql
-- Self-contained synthetic fixtures. All writes roll back.
\set ON_ERROR_STOP 1
BEGIN;
CREATE FUNCTION pg_temp.assert_true(p_ok BOOLEAN, p_label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'FAIL: %', p_label; END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;
CREATE FUNCTION pg_temp.expect_error(p_sql TEXT, p_state TEXT, p_label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL: % unexpectedly succeeded', p_label;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_state THEN RAISE; END IF;
  RAISE NOTICE 'PASS: %', p_label;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_true(BOOLEAN, TEXT), pg_temp.expect_error(TEXT, TEXT, TEXT)
TO authenticated, anon;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT md5('bolt2-' || name)::uuid, name || '@accounts.team-fire.invalid', '{}'::jsonb
FROM unnest(ARRAY['bolt2po','bolt2sm','bolt2dev','bolt2viewer','bolt2outsider']) name;

INSERT INTO public.projects (id, name, key, owner_id, timezone)
VALUES (md5('bolt2-project')::uuid, 'Bolt 002 local checks', 'BOLT2TEST',
        md5('bolt2-bolt2po')::uuid, 'Asia/Karachi');
INSERT INTO public.project_members (project_id, user_id, role)
SELECT md5('bolt2-project')::uuid, md5('bolt2-' || name)::uuid, role
FROM (VALUES ('bolt2po','Product Owner'), ('bolt2sm','Scrum Master'),
             ('bolt2dev','Developer'), ('bolt2viewer','Viewer')) members(name,role);
INSERT INTO public.sprints (id, project_id, name, goal, start_date, end_date)
SELECT md5('bolt2-sprint-' || n)::uuid, md5('bolt2-project')::uuid, 'Sprint ' || n,
       'Verify recorded timing', (clock_timestamp() AT TIME ZONE 'Asia/Karachi')::date - 1,
       (clock_timestamp() AT TIME ZONE 'Asia/Karachi')::date + 2
FROM generate_series(1,2) n;
INSERT INTO public.work_items (id, project_id, key, title, type, priority, estimate, sprint_id)
SELECT md5('bolt2-item-' || n)::uuid, md5('bolt2-project')::uuid, 'B2-' || n, 'Timing test',
       'Technical Task', 'High', 3, md5('bolt2-sprint-' || n)::uuid
FROM generate_series(1,2) n;

SELECT pg_temp.assert_true(
  (SELECT started_at IS NULL AND timezone_snapshot IS NULL FROM public.sprints WHERE id=md5('bolt2-sprint-1')::uuid),
  'planned sprint has no invented start or timezone');
SELECT pg_temp.assert_true(
  ('2026-11-22 18:59:59+00'::timestamptz AT TIME ZONE 'Asia/Karachi')::date = DATE '2026-11-22'
  AND ('2026-11-22 19:00:00+00'::timestamptz AT TIME ZONE 'Asia/Karachi')::date = DATE '2026-11-23',
  'Karachi local date changes precisely at midnight');
SELECT pg_temp.assert_true(
  ('2026-03-08 06:59:59+00'::timestamptz AT TIME ZONE 'America/New_York')::time = TIME '01:59:59'
  AND ('2026-03-08 07:00:00+00'::timestamptz AT TIME ZONE 'America/New_York')::time = TIME '03:00:00',
  'timezone conversion preserves the daylight-saving gap');

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '42501', 'anonymous start denied');
RESET ROLE;
UPDATE public.profiles SET disabled_at=clock_timestamp() WHERE id=md5('bolt2-bolt2po')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2po')::uuid::text, true);
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '28000', 'disabled account denied');
RESET ROLE;
UPDATE public.profiles SET disabled_at=NULL WHERE id=md5('bolt2-bolt2po')::uuid;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2outsider')::uuid::text, true);
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '42501', 'wrong project denied');
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2viewer')::uuid::text, true);
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '42501', 'Viewer cannot start');
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2dev')::uuid::text, true);
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '42501', 'Developer cannot start');
RESET ROLE;

-- End-date equality fails even when the database session uses a different zone.
SET LOCAL TIME ZONE 'Pacific/Honolulu';
UPDATE public.sprints SET end_date=(clock_timestamp() AT TIME ZONE 'Asia/Karachi')::date
WHERE id=md5('bolt2-sprint-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2po')::uuid::text, true);
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '22023', 'planned end date reached is rejected');
RESET ROLE;
SELECT pg_temp.assert_true(
  NOT EXISTS (SELECT 1 FROM public.sprint_commitments WHERE sprint_id=md5('bolt2-sprint-1')::uuid),
  'rejected start creates no commitment');
UPDATE public.sprints SET start_date=end_date - 2, end_date=end_date - 1
WHERE id=md5('bolt2-sprint-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '22023', 'expired start rejected');
RESET ROLE;
UPDATE public.sprints SET start_date=end_date + 3, end_date=end_date + 2 WHERE id=md5('bolt2-sprint-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '22023', 'invalid date range rejected');
RESET ROLE;
UPDATE public.sprints SET start_date=(clock_timestamp() AT TIME ZONE 'Asia/Karachi')::date - 1,
 end_date=(clock_timestamp() AT TIME ZONE 'Asia/Karachi')::date + 2, goal=''
WHERE id=md5('bolt2-sprint-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '22023', 'empty goal rejected');
RESET ROLE;
UPDATE public.sprints SET goal='Timing' WHERE id=md5('bolt2-sprint-1')::uuid;
UPDATE public.work_items SET estimate=NULL WHERE id=md5('bolt2-item-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid)$q$, '22023', 'unestimated item rejected');
RESET ROLE;
UPDATE public.work_items SET estimate=3 WHERE id=md5('bolt2-item-1')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid, -1)$q$, '40001', 'stale version rejected');
SELECT public.rpc_start_sprint(md5('bolt2-sprint-1')::uuid);
SELECT pg_temp.assert_true(
 (SELECT status='ACTIVE' AND started_at IS NOT NULL AND timezone_snapshot='Asia/Karachi'
  FROM public.sprints WHERE id=md5('bolt2-sprint-1')::uuid),
 'successful start records actual instant and timezone together');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND sum(frozen_estimate)=3 FROM public.sprint_commitments
  WHERE sprint_id=md5('bolt2-sprint-1')::uuid),
 'successful start freezes commitment once');
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint(md5('bolt2-sprint-2')::uuid)$q$, '22023', 'one active sprint retained');
RESET ROLE;

UPDATE public.projects SET timezone='America/New_York' WHERE id=md5('bolt2-project')::uuid;
SELECT pg_temp.assert_true(
 (SELECT timezone_snapshot='Asia/Karachi' FROM public.sprints WHERE id=md5('bolt2-sprint-1')::uuid),
 'later project timezone edit does not redraw active history');
SELECT pg_temp.expect_error(
 $q$UPDATE public.sprints SET timezone_snapshot='America/New_York' WHERE id=md5('bolt2-sprint-1')::uuid$q$,
 '22023', 'recorded timezone cannot be rewritten');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', md5('bolt2-bolt2sm')::uuid::text, true);
SELECT public.rpc_complete_sprint(md5('bolt2-sprint-1')::uuid, md5('bolt2-sprint-2')::uuid);
SELECT pg_temp.assert_true(
 (SELECT timezone_snapshot='Asia/Karachi' AND started_at IS NOT NULL AND completed_at IS NOT NULL
 FROM public.sprints WHERE id=md5('bolt2-sprint-1')::uuid),
 'completion preserves timing and records its frozen cutoff');
SELECT pg_temp.expect_error(
 $q$SELECT public.rpc_update_sprint(md5('bolt2-sprint-1')::uuid, '{"goal":"changed"}')$q$,
 '22023', 'completed sprint editing remains forbidden');
SELECT public.rpc_start_sprint(md5('bolt2-sprint-2')::uuid);
SELECT pg_temp.assert_true(
 (SELECT timezone_snapshot='America/New_York' FROM public.sprints WHERE id=md5('bolt2-sprint-2')::uuid),
 'next start captures the new project timezone');
SELECT pg_temp.expect_error(
 $q$UPDATE public.sprints SET timezone_snapshot='UTC' WHERE id=md5('bolt2-sprint-2')::uuid$q$,
 '42501', 'direct client writes remain forbidden');
ROLLBACK;
\echo 'BOLT 002 DATABASE TESTS PASSED'
