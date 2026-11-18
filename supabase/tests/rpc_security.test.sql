-- RPC permission and behaviour tests. Run after migrations + seed-demo.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rpc_security.test.sql
-- Each block impersonates a user the way PostgREST does (role + JWT sub claim)
-- and rolls back, so the database is unchanged afterwards.
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_uid UUID) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_uid::TEXT, ''), true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid)::TEXT, true);
  EXECUTE CASE WHEN p_uid IS NULL THEN 'SET LOCAL ROLE anon' ELSE 'SET LOCAL ROLE authenticated' END;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_state TEXT, p_label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RAISE EXCEPTION 'FAIL %: expected SQLSTATE % but call succeeded', p_label, p_state;
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE <> p_state THEN
    RAISE EXCEPTION 'FAIL %: expected SQLSTATE %, got % (%)', p_label, p_state, SQLSTATE, SQLERRM;
  END IF;
  RAISE NOTICE 'ok  %', p_label;
END $$;

GRANT EXECUTE ON FUNCTION pg_temp.expect_error(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ids from seed-demo.sql
\set po      '''a0000000-0000-4000-8000-000000000001'''
\set sm      '''a0000000-0000-4000-8000-000000000002'''
\set dev     '''a0000000-0000-4000-8000-000000000003'''
\set viewer  '''a0000000-0000-4000-8000-000000000005'''
\set s2      '''b0000000-0000-4000-8000-000000000002'''
\set s3      '''b0000000-0000-4000-8000-000000000003'''

-- Outsider account with no membership
INSERT INTO auth.users (id, email, aud, role, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000000ff', 'outsider@accounts.team-fire.invalid', 'authenticated', 'authenticated', now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, username, display_name) VALUES ('a0000000-0000-4000-8000-0000000000ff', 'outsider', 'Outsider')
ON CONFLICT (id) DO NOTHING;

-- 1. anon: no reads, no RPCs
BEGIN;
SELECT pg_temp.as_user(NULL);
SELECT pg_temp.expect_error('SELECT count(*) FROM public.work_items', '42501', 'anon cannot read work_items');
SELECT pg_temp.expect_error($q$SELECT public.rpc_create_project('X')$q$, '42501', 'anon cannot execute RPCs');
ROLLBACK;

-- 2. outsider: sees nothing, cannot write
BEGIN;
SELECT pg_temp.as_user('a0000000-0000-4000-8000-0000000000ff');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.work_items) <> 0 THEN RAISE EXCEPTION 'FAIL outsider can read items'; END IF;
  IF (SELECT count(*) FROM public.work_item_status_history) <> 0 THEN RAISE EXCEPTION 'FAIL outsider can read history'; END IF;
  IF (SELECT count(*) FROM public.sprint_scope_events) <> 0 THEN RAISE EXCEPTION 'FAIL outsider can read scope events'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN RAISE EXCEPTION 'FAIL outsider sees other profiles'; END IF;
  RAISE NOTICE 'ok  outsider reads only own profile';
END $$;
SELECT pg_temp.expect_error($q$SELECT public.rpc_move_work_item((SELECT md5('team-fire-item-104')::uuid), 'Testing')$q$, '42501', 'outsider cannot move a card (wrong project)');
SELECT pg_temp.expect_error($q$UPDATE public.work_items SET title = 'x'$q$, '42501', 'direct table writes are revoked');
ROLLBACK;

-- 3. viewer: read-only
BEGIN;
SELECT pg_temp.as_user(:viewer);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.work_items) <> 11 THEN RAISE EXCEPTION 'FAIL viewer cannot read project items'; END IF;
  RAISE NOTICE 'ok  viewer reads project items';
END $$;
SELECT pg_temp.expect_error($q$SELECT public.rpc_move_work_item((SELECT md5('team-fire-item-104')::uuid), 'Testing')$q$, '42501', 'viewer cannot move a card');
SELECT pg_temp.expect_error($q$SELECT public.rpc_create_work_item('f0000000-0000-4000-8000-000000000001', 'x', 'Bug', 'Low')$q$, '42501', 'viewer cannot create items');
ROLLBACK;

-- 4. developer: can move/create, cannot plan or reorder
BEGIN;
SELECT pg_temp.as_user(:dev);
SELECT public.rpc_move_work_item(md5('team-fire-item-107')::uuid, 'In Progress', NULL, '11111111-2222-4333-8444-555555555555');
SELECT public.rpc_move_work_item(md5('team-fire-item-107')::uuid, 'Testing', NULL, '11111111-2222-4333-8444-555555555555');
DO $$ BEGIN
  IF (SELECT status FROM public.work_items WHERE id = md5('team-fire-item-107')::uuid) <> 'In Progress' THEN
    RAISE EXCEPTION 'FAIL retried mutation id was applied twice'; END IF;
  IF (SELECT count(*) FROM public.work_item_status_history WHERE mutation_id = '11111111-2222-4333-8444-555555555555') <> 1 THEN
    RAISE EXCEPTION 'FAIL duplicate history row'; END IF;
  RAISE NOTICE 'ok  move writes history once; retry is idempotent';
END $$;
SELECT pg_temp.expect_error($q$SELECT public.rpc_move_work_item(md5('team-fire-item-107')::uuid, 'Done')$q$, '22023', 'Done blocked by open checklist');
SELECT pg_temp.expect_error($q$SELECT public.rpc_update_work_item(md5('team-fire-item-104')::uuid, '{"points":8}')$q$, '22023', 'estimate locked in active sprint');
SELECT pg_temp.expect_error($q$SELECT public.rpc_move_work_item(md5('team-fire-item-104')::uuid, 'Done', 99)$q$, '40001', 'stale version conflicts');
SELECT pg_temp.expect_error($q$SELECT public.rpc_complete_sprint('b0000000-0000-4000-8000-000000000002')$q$, '42501', 'developer cannot complete sprint');
SELECT pg_temp.expect_error($q$SELECT public.rpc_reorder_backlog(md5('team-fire-item-109')::uuid, -1)$q$, '42501', 'developer cannot reorder backlog');
SELECT pg_temp.expect_error($q$SELECT public.rpc_allocate_item(md5('team-fire-item-109')::uuid, 'b0000000-0000-4000-8000-000000000003')$q$, '42501', 'developer cannot allocate');
ROLLBACK;

-- 5. Product Owner / Scrum Master full lifecycle
BEGIN;
SELECT pg_temp.as_user(:po);
SELECT public.rpc_reorder_backlog(md5('team-fire-item-109')::uuid, -1);
DO $$ BEGIN
  IF (SELECT position FROM public.work_items WHERE id = md5('team-fire-item-109')::uuid)
     >= (SELECT position FROM public.work_items WHERE id = md5('team-fire-item-108')::uuid) THEN
    RAISE EXCEPTION 'FAIL reorder did not move item up'; END IF;
  RAISE NOTICE 'ok  PO reorders backlog';
END $$;
SELECT public.rpc_allocate_item(md5('team-fire-item-108')::uuid, 'b0000000-0000-4000-8000-000000000002', 'Urgent evidence work');
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.sprint_scope_events WHERE work_item_id = md5('team-fire-item-108')::uuid AND action = 'ADDED') THEN
    RAISE EXCEPTION 'FAIL no scope event for mid-sprint add'; END IF;
  RAISE NOTICE 'ok  mid-sprint add records a scope event';
END $$;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint('b0000000-0000-4000-8000-000000000003')$q$, '22023', 'cannot start second active sprint');
SELECT pg_temp.as_user(:sm);
SELECT public.rpc_complete_sprint('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003');
DO $$ DECLARE r JSONB; BEGIN
  SELECT result INTO r FROM public.sprints WHERE id = 'b0000000-0000-4000-8000-000000000002';
  IF (r ->> 'commitment')::INT <> 18 THEN RAISE EXCEPTION 'FAIL commitment snapshot %', r; END IF;
  IF (SELECT count(*) FROM public.work_items WHERE sprint_id = 'b0000000-0000-4000-8000-000000000003') <> 5 THEN
    RAISE EXCEPTION 'FAIL unresolved items not carried over'; END IF;
  RAISE NOTICE 'ok  complete freezes result and carries unresolved items';
END $$;
SELECT public.rpc_start_sprint('b0000000-0000-4000-8000-000000000003');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.sprint_commitments WHERE sprint_id = 'b0000000-0000-4000-8000-000000000003') <> 5 THEN
    RAISE EXCEPTION 'FAIL start did not freeze commitments'; END IF;
  IF EXISTS (SELECT 1 FROM public.sprint_commitments c LEFT JOIN public.work_items w ON w.id = c.work_item_id WHERE w.id IS NULL) THEN
    RAISE EXCEPTION 'FAIL commitment rows reference missing items'; END IF;
  RAISE NOTICE 'ok  start freezes commitment with correct ids';
END $$;
SELECT pg_temp.expect_error($q$SELECT public.rpc_start_sprint('b0000000-0000-4000-8000-000000000003')$q$, '22023', 'start is not repeatable');
ROLLBACK;

-- 6. Project creation sets ownership from the session, not the caller
BEGIN;
SELECT pg_temp.as_user(:dev);
DO $$ DECLARE p JSONB; BEGIN
  p := public.rpc_create_project('Fire', NULL, 'x', 'Asia/Karachi');
  IF (p ->> 'owner_id')::UUID <> 'a0000000-0000-4000-8000-000000000003' THEN RAISE EXCEPTION 'FAIL owner not caller'; END IF;
  IF p ->> 'key' = 'FIRE' THEN RAISE EXCEPTION 'FAIL duplicate key'; END IF;
  RAISE NOTICE 'ok  create project: caller is owner, key de-duplicated (%)', p ->> 'key';
END $$;
ROLLBACK;

\echo 'ALL RPC SECURITY TESTS PASSED'
