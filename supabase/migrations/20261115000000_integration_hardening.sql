-- Integration hardening and UI contract support.
-- Forward-only and additive: earlier merged migrations are not edited.
--
-- * RLS on every exposed table; no direct writes for anon/authenticated (PROJ-04).
-- * Every write goes through a SECURITY DEFINER RPC that pins search_path,
--   checks auth.uid(), disabled status, project membership and role.
-- * Fixes rpc_start_sprint (commitment columns were swapped) and removes the
--   spoofable rpc_create_project(..., p_owner_id) overload.
-- * Adds the fields the workspace UI uses (hours, epic, labels, WBS ref,
--   checklist, WIP limits, hour capacity, sprint result snapshot).
-- Refs: PROJ-01, PROJ-04, ITEM-01, ITEM-03, ITEM-04, ITEM-05, ITEM-07, SPR-01..SPR-06,
--       BOARD-03, BOARD-05, BOARD-06, MET-01

-- ---------------------------------------------------------------------------
-- 1. Additive columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS wip_limits JSONB NOT NULL
  DEFAULT '{"To Do":99,"In Progress":3,"Code Review":2,"Testing":2,"Done":99}'::jsonb;

ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS hours INT CHECK (hours IS NULL OR hours >= 0),
  ADD COLUMN IF NOT EXISTS epic TEXT NOT NULL DEFAULT 'Unassigned',
  ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS wbs TEXT NOT NULL DEFAULT '—',
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sprints
  ADD COLUMN IF NOT EXISTS hour_capacity INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result JSONB;

-- One ordered sequence across status and scope events, for metric replay
-- (requirements section 5, rule 9).
CREATE SEQUENCE IF NOT EXISTS public.event_seq;
ALTER TABLE public.work_item_status_history
  ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT nextval('public.event_seq');
ALTER TABLE public.sprint_scope_events
  ADD COLUMN IF NOT EXISTS seq BIGINT NOT NULL DEFAULT nextval('public.event_seq');

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_history_mutation
  ON public.work_item_status_history (mutation_id);
CREATE INDEX IF NOT EXISTS idx_work_items_project ON public.work_items (project_id, position);
CREATE INDEX IF NOT EXISTS idx_members_user ON public.project_members (user_id) WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Row Level Security on every exposed table
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.is_member(UUID, UUID) SET search_path = '';
ALTER FUNCTION public.is_member(UUID, UUID) STABLE;

ALTER TABLE public.work_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprint_scope_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read status history" ON public.work_item_status_history
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), project_id));
CREATE POLICY "Members read commitments" ON public.sprint_commitments
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sprints s WHERE s.id = sprint_id AND public.is_member(auth.uid(), s.project_id)));
CREATE POLICY "Members read scope events" ON public.sprint_scope_events
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.sprints s WHERE s.id = sprint_id AND public.is_member(auth.uid(), s.project_id)));
CREATE POLICY "Members read revisions" ON public.project_revisions
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), project_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.profiles, public.projects, public.project_members, public.sprints, public.work_items,
  public.work_item_status_history, public.sprint_commitments, public.sprint_scope_events,
  public.project_revisions
FROM anon, authenticated;
REVOKE ALL ON
  public.profiles, public.projects, public.project_members, public.sprints, public.work_items,
  public.work_item_status_history, public.sprint_commitments, public.sprint_scope_events,
  public.project_revisions
FROM anon;
GRANT SELECT ON
  public.profiles, public.projects, public.project_members, public.sprints, public.work_items,
  public.work_item_status_history, public.sprint_commitments, public.sprint_scope_events,
  public.project_revisions
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Profile row for every provisioned auth account (AUTH-03)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_username TEXT := lower(split_part(NEW.email, '@', 1));
BEGIN
  INSERT INTO public.profiles (id, username, display_name)
  VALUES (NEW.id, left(v_username, 32),
          COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'display_name', ''), v_username))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 4. Internal guards (not callable by clients)
-- ---------------------------------------------------------------------------
-- Error codes the API maps to HTTP: 28000→401, 42501→403, P0002→404,
-- 40001→409, 22023→422.
CREATE OR REPLACE FUNCTION public.tf_require_role(p_project_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Account disabled' USING ERRCODE = '28000';
  END IF;
  SELECT m.role INTO v_role FROM public.project_members m
  WHERE m.project_id = p_project_id AND m.user_id = v_uid AND m.removed_at IS NULL;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Not a member of this project' USING ERRCODE = '42501';
  END IF;
  IF p_roles IS NOT NULL AND NOT (v_role = ANY (p_roles)) THEN
    RAISE EXCEPTION 'The % role cannot do this', v_role USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Project is archived and read-only' USING ERRCODE = '22023';
  END IF;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.tf_bump_revision(p_project_id UUID)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.project_revisions (project_id, board_revision, updated_at)
  VALUES (p_project_id, 2, clock_timestamp())
  ON CONFLICT (project_id) DO UPDATE
    SET board_revision = public.project_revisions.board_revision + 1, updated_at = clock_timestamp();
$$;

CREATE OR REPLACE FUNCTION public.tf_check_version(p_actual INT, p_expected INT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_expected IS NOT NULL AND p_actual <> p_expected THEN
    RAISE EXCEPTION 'Someone else changed this first. Refresh and try again.' USING ERRCODE = '40001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.tf_require_role(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tf_bump_revision(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tf_check_version(INT, INT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Remove unsafe or superseded RPC signatures
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_create_project(TEXT, TEXT, TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_create_work_item(UUID, TEXT, JSONB, TEXT, TEXT, INT, UUID);
DROP FUNCTION IF EXISTS public.rpc_move_work_item(UUID, TEXT, INT, INT, UUID);
DROP FUNCTION IF EXISTS public.rpc_start_sprint(UUID, INT);

-- ---------------------------------------------------------------------------
-- 6. Domain RPCs
-- ---------------------------------------------------------------------------

-- PROJ-01: any signed-in account creates a project and becomes its Product Owner.
CREATE OR REPLACE FUNCTION public.rpc_create_project(
  p_name TEXT, p_key TEXT DEFAULT NULL, p_description TEXT DEFAULT NULL, p_timezone TEXT DEFAULT 'Asia/Karachi'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_base TEXT;
  v_key TEXT;
  v_n INT := 1;
  v_project public.projects%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Account disabled' USING ERRCODE = '28000';
  END IF;
  IF COALESCE(btrim(p_name), '') = '' OR length(p_name) > 120 THEN
    RAISE EXCEPTION 'Project name is required (max 120 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = p_timezone) THEN
    RAISE EXCEPTION 'Unknown timezone' USING ERRCODE = '22023';
  END IF;

  v_base := upper(regexp_replace(COALESCE(NULLIF(btrim(p_key), ''), p_name), '[^A-Za-z0-9]', '', 'g'));
  v_base := left(COALESCE(NULLIF(v_base, ''), 'PRJ'), 6);
  v_key := v_base;
  WHILE EXISTS (SELECT 1 FROM public.projects p WHERE p.key = v_key) LOOP
    v_n := v_n + 1;
    v_key := left(v_base, 6) || v_n::TEXT;
  END LOOP;

  INSERT INTO public.projects (name, key, description, timezone, owner_id)
  VALUES (btrim(p_name), v_key, NULLIF(btrim(p_description), ''), p_timezone, v_uid)
  RETURNING * INTO v_project;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_project.id, v_uid, 'Product Owner');

  PERFORM public.tf_bump_revision(v_project.id);
  RETURN to_jsonb(v_project);
END;
$$;

-- SPR-01
CREATE OR REPLACE FUNCTION public.rpc_create_sprint(
  p_project_id UUID, p_name TEXT, p_goal TEXT DEFAULT '', p_start DATE DEFAULT NULL, p_end DATE DEFAULT NULL,
  p_point_capacity INT DEFAULT 20, p_hour_capacity INT DEFAULT 70
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
  v_start DATE := COALESCE(p_start, current_date);
  v_end DATE := COALESCE(p_end, current_date + 14);
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF COALESCE(btrim(p_name), '') = '' THEN RAISE EXCEPTION 'Sprint name is required' USING ERRCODE = '22023'; END IF;
  IF v_end <= v_start THEN RAISE EXCEPTION 'End date must follow start date' USING ERRCODE = '22023'; END IF;
  IF p_point_capacity < 0 OR p_hour_capacity < 0 THEN RAISE EXCEPTION 'Capacity cannot be negative' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.sprints (project_id, name, goal, start_date, end_date, capacity_points, hour_capacity, status)
  VALUES (p_project_id, btrim(p_name), COALESCE(p_goal, ''), v_start, v_end, p_point_capacity, p_hour_capacity, 'PLANNED')
  RETURNING * INTO v_sprint;

  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_sprint);
END;
$$;

-- Planned sprint edits (goal, dates, capacities).
CREATE OR REPLACE FUNCTION public.rpc_update_sprint(p_sprint_id UUID, p_patch JSONB, p_expected_version INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
BEGIN
  SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_sprint.project_id, ARRAY['Product Owner', 'Scrum Master']);
  PERFORM public.tf_check_version(v_sprint.version, p_expected_version);
  IF v_sprint.status <> 'PLANNED' THEN RAISE EXCEPTION 'Only planned sprints can be edited' USING ERRCODE = '22023'; END IF;

  UPDATE public.sprints SET
    goal = CASE WHEN p_patch ? 'goal' THEN COALESCE(p_patch ->> 'goal', '') ELSE goal END,
    start_date = CASE WHEN p_patch ? 'start' THEN (p_patch ->> 'start')::DATE ELSE start_date END,
    end_date = CASE WHEN p_patch ? 'end' THEN (p_patch ->> 'end')::DATE ELSE end_date END,
    capacity_points = CASE WHEN p_patch ? 'pointCapacity' THEN GREATEST(0, (p_patch ->> 'pointCapacity')::INT) ELSE capacity_points END,
    hour_capacity = CASE WHEN p_patch ? 'hourCapacity' THEN GREATEST(0, (p_patch ->> 'hourCapacity')::INT) ELSE hour_capacity END,
    version = version + 1
  WHERE id = p_sprint_id RETURNING * INTO v_sprint;

  IF v_sprint.end_date <= v_sprint.start_date THEN
    RAISE EXCEPTION 'End date must follow start date' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tf_bump_revision(v_sprint.project_id);
  RETURN to_jsonb(v_sprint);
END;
$$;

-- SPR-04: atomic start. Freezes item IDs and estimates; safe to retry.
CREATE OR REPLACE FUNCTION public.rpc_start_sprint(p_sprint_id UUID, p_expected_version INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
  v_uid UUID := auth.uid();
  v_unestimated INT;
BEGIN
  SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_sprint.project_id, ARRAY['Product Owner', 'Scrum Master']);

  -- Lock order (ADR-012): project, then sprint.
  PERFORM 1 FROM public.projects WHERE id = v_sprint.project_id FOR UPDATE;
  SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id FOR UPDATE;
  PERFORM public.tf_check_version(v_sprint.version, p_expected_version);

  IF v_sprint.status <> 'PLANNED' THEN RAISE EXCEPTION 'Only a planned sprint can be started' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.sprints s WHERE s.project_id = v_sprint.project_id AND s.status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Another sprint is already active. Complete it first.' USING ERRCODE = '22023';
  END IF;
  IF v_sprint.end_date <= v_sprint.start_date THEN RAISE EXCEPTION 'End date must follow start date' USING ERRCODE = '22023'; END IF;
  IF COALESCE(btrim(v_sprint.goal), '') = '' THEN RAISE EXCEPTION 'Add a sprint goal before starting' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_items w WHERE w.sprint_id = p_sprint_id AND w.archived_at IS NULL) THEN
    RAISE EXCEPTION 'Allocate at least one item before starting' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_unestimated FROM public.work_items w
  WHERE w.sprint_id = p_sprint_id AND w.archived_at IS NULL AND w.estimate IS NULL;
  IF v_unestimated > 0 THEN
    RAISE EXCEPTION '% sprint item(s) still need a story-point estimate', v_unestimated USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.sprint_commitments (sprint_id, work_item_id, frozen_estimate, frozen_status)
  SELECT p_sprint_id, w.id, w.estimate, w.status
  FROM public.work_items w WHERE w.sprint_id = p_sprint_id AND w.archived_at IS NULL
  ORDER BY w.id
  ON CONFLICT (sprint_id, work_item_id) DO NOTHING;

  INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id)
  SELECT p_sprint_id, w.id, 'ADDED', 'Sprint commitment', w.estimate, v_uid
  FROM public.work_items w WHERE w.sprint_id = p_sprint_id AND w.archived_at IS NULL
  ORDER BY w.id;

  UPDATE public.sprints SET status = 'ACTIVE', started_at = clock_timestamp(), version = version + 1
  WHERE id = p_sprint_id RETURNING * INTO v_sprint;

  PERFORM public.tf_bump_revision(v_sprint.project_id);
  RETURN to_jsonb(v_sprint);
END;
$$;

-- SPR-06 / SPR-07: atomic completion with frozen results; unresolved items
-- return to the backlog or carry to a selected planned sprint.
CREATE OR REPLACE FUNCTION public.rpc_complete_sprint(
  p_sprint_id UUID, p_target_sprint_id UUID DEFAULT NULL, p_expected_version INT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
  v_target public.sprints%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_delivered INT;
  v_original INT;
  v_commitment INT;
BEGIN
  SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sprint not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_sprint.project_id, ARRAY['Product Owner', 'Scrum Master']);

  PERFORM 1 FROM public.projects WHERE id = v_sprint.project_id FOR UPDATE;
  SELECT * INTO v_sprint FROM public.sprints WHERE id = p_sprint_id FOR UPDATE;
  PERFORM public.tf_check_version(v_sprint.version, p_expected_version);
  IF v_sprint.status <> 'ACTIVE' THEN RAISE EXCEPTION 'Only the active sprint can be completed' USING ERRCODE = '22023'; END IF;

  IF p_target_sprint_id IS NOT NULL THEN
    SELECT * INTO v_target FROM public.sprints WHERE id = p_target_sprint_id FOR UPDATE;
    IF NOT FOUND OR v_target.project_id <> v_sprint.project_id OR v_target.status <> 'PLANNED' THEN
      RAISE EXCEPTION 'Carry-over target must be a planned sprint in this project' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Lock the sprint's items so no card move can interleave with the snapshot.
  PERFORM 1 FROM public.work_items w WHERE w.sprint_id = p_sprint_id ORDER BY w.id FOR UPDATE;

  SELECT COALESCE(sum(COALESCE((
           SELECT e.estimate_at_event FROM public.sprint_scope_events e
           WHERE e.sprint_id = p_sprint_id AND e.work_item_id = w.id AND e.action = 'ADDED'
           ORDER BY e.seq DESC LIMIT 1), w.estimate, 0)), 0)
    INTO v_delivered
  FROM public.work_items w
  WHERE w.sprint_id = p_sprint_id AND w.archived_at IS NULL AND w.status = 'Done';

  SELECT COALESCE(sum(c.frozen_estimate), 0) INTO v_commitment
  FROM public.sprint_commitments c WHERE c.sprint_id = p_sprint_id;

  SELECT COALESCE(sum(c.frozen_estimate), 0) INTO v_original
  FROM public.sprint_commitments c
  JOIN public.work_items w ON w.id = c.work_item_id
  WHERE c.sprint_id = p_sprint_id AND w.sprint_id = p_sprint_id AND w.status = 'Done' AND w.archived_at IS NULL;

  UPDATE public.work_items SET sprint_id = p_target_sprint_id, version = version + 1, updated_at = v_now
  WHERE sprint_id = p_sprint_id AND status <> 'Done';

  UPDATE public.sprints SET
    status = 'COMPLETED', completed_at = v_now, version = version + 1,
    result = jsonb_build_object('delivered', v_delivered, 'originalDelivered', v_original,
                                'commitment', v_commitment, 'cutoff', v_now)
  WHERE id = p_sprint_id RETURNING * INTO v_sprint;

  PERFORM public.tf_bump_revision(v_sprint.project_id);
  RETURN to_jsonb(v_sprint);
END;
$$;

-- ITEM-01 / ITEM-04 / ITEM-07: create with stable key and initial status history.
CREATE OR REPLACE FUNCTION public.rpc_create_work_item(
  p_project_id UUID, p_title TEXT, p_type TEXT, p_priority TEXT, p_estimate INT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_n INT;
  v_pos INT;
  v_item public.work_items%ROWTYPE;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF COALESCE(btrim(p_title), '') = '' OR length(p_title) > 200 THEN
    RAISE EXCEPTION 'Title is required (max 200 characters)' USING ERRCODE = '22023';
  END IF;
  IF p_estimate IS NOT NULL AND p_estimate NOT IN (1, 2, 3, 5, 8, 13) THEN
    RAISE EXCEPTION 'Story points must be 1, 2, 3, 5, 8 or 13' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  SELECT COALESCE(max(NULLIF(regexp_replace(w.key, '^.*-', ''), '')::INT), 0) + 1,
         COALESCE(max(w.position), 0) + 1
    INTO v_n, v_pos
  FROM public.work_items w WHERE w.project_id = p_project_id AND w.key ~ '-[0-9]+$';

  INSERT INTO public.work_items (project_id, key, title, type, priority, estimate, status, position)
  VALUES (p_project_id, v_project.key || '-' || lpad(v_n::TEXT, 3, '0'), btrim(p_title),
          p_type, p_priority, p_estimate, 'To Do', v_pos)
  RETURNING * INTO v_item;

  INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id)
  VALUES (p_project_id, v_item.id, NULL, 'To Do', auth.uid(), NULL, gen_random_uuid());

  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- ITEM-01 / SPR-05: field edits with optimistic version and estimate lock.
CREATE OR REPLACE FUNCTION public.rpc_update_work_item(p_item_id UUID, p_patch JSONB, p_expected_version INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_sprint_status TEXT;
  v_assignee UUID;
  v_estimate INT;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  PERFORM public.tf_check_version(v_item.version, p_expected_version);

  SELECT s.status INTO v_sprint_status FROM public.sprints s WHERE s.id = v_item.sprint_id;

  IF p_patch ? 'points' THEN
    v_estimate := NULLIF(p_patch ->> 'points', '')::INT;
    IF v_estimate IS NOT NULL AND v_estimate NOT IN (1, 2, 3, 5, 8, 13) THEN
      RAISE EXCEPTION 'Story points must be 1, 2, 3, 5, 8 or 13' USING ERRCODE = '22023';
    END IF;
    IF v_sprint_status = 'ACTIVE' AND v_estimate IS DISTINCT FROM v_item.estimate THEN
      RAISE EXCEPTION 'Estimates are locked while the item is in the active sprint' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_patch ? 'hours' AND v_sprint_status = 'ACTIVE'
     AND NULLIF(p_patch ->> 'hours', '')::INT IS DISTINCT FROM v_item.hours THEN
    RAISE EXCEPTION 'Estimates are locked while the item is in the active sprint' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'title' AND COALESCE(btrim(p_patch ->> 'title'), '') = '' THEN
    RAISE EXCEPTION 'Title is required' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'assigneeId' THEN
    v_assignee := NULLIF(p_patch ->> 'assigneeId', '')::UUID;
    IF v_assignee IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.project_id = v_item.project_id AND m.user_id = v_assignee AND m.removed_at IS NULL) THEN
      RAISE EXCEPTION 'Assignee must be a project member' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.work_items SET
    title = CASE WHEN p_patch ? 'title' THEN left(btrim(p_patch ->> 'title'), 200) ELSE title END,
    description = CASE WHEN p_patch ? 'description' THEN jsonb_build_object('text', COALESCE(p_patch ->> 'description', '')) ELSE description END,
    estimate = CASE WHEN p_patch ? 'points' THEN v_estimate ELSE estimate END,
    hours = CASE WHEN p_patch ? 'hours' THEN GREATEST(0, NULLIF(p_patch ->> 'hours', '')::INT) ELSE hours END,
    assignee_id = CASE WHEN p_patch ? 'assigneeId' THEN v_assignee ELSE assignee_id END,
    priority = CASE WHEN p_patch ? 'priority' THEN p_patch ->> 'priority' ELSE priority END,
    epic = CASE WHEN p_patch ? 'epic' THEN COALESCE(NULLIF(btrim(p_patch ->> 'epic'), ''), 'Unassigned') ELSE epic END,
    version = version + 1,
    updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- BOARD-02 / BOARD-03 / BOARD-06: status change with history; retry-safe by mutation id.
CREATE OR REPLACE FUNCTION public.rpc_move_work_item(
  p_item_id UUID, p_new_status TEXT, p_expected_version INT DEFAULT NULL, p_mutation_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_sprint_status TEXT;
  v_mutation UUID := COALESCE(p_mutation_id, gen_random_uuid());
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);

  IF EXISTS (SELECT 1 FROM public.work_item_status_history h WHERE h.mutation_id = v_mutation) THEN
    RETURN to_jsonb(v_item); -- duplicate retry: no second history row
  END IF;

  IF v_item.sprint_id IS NOT NULL THEN
    SELECT s.status INTO v_sprint_status FROM public.sprints s WHERE s.id = v_item.sprint_id FOR SHARE;
  END IF;
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  PERFORM public.tf_check_version(v_item.version, p_expected_version);

  IF p_new_status NOT IN ('To Do', 'In Progress', 'Code Review', 'Testing', 'Done') THEN
    RAISE EXCEPTION 'Unknown status' USING ERRCODE = '22023';
  END IF;
  IF v_sprint_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'This sprint is completed; its items are read-only' USING ERRCODE = '22023';
  END IF;
  IF v_item.status = p_new_status THEN RETURN to_jsonb(v_item); END IF;
  IF p_new_status = 'Done' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_item.checklist) c WHERE NOT COALESCE((c ->> 'done')::BOOLEAN, false)) THEN
    RAISE EXCEPTION 'Finish every checklist item before moving to Done' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id)
  VALUES (v_item.project_id, v_item.id, v_item.status, p_new_status, auth.uid(), v_item.sprint_id, v_mutation);

  UPDATE public.work_items SET status = p_new_status, version = version + 1, updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- ITEM-05: Product Owner reorders the backlog (swap with neighbour).
CREATE OR REPLACE FUNCTION public.rpc_reorder_backlog(p_item_id UUID, p_direction INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_other public.work_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner']);
  IF p_direction NOT IN (-1, 1) THEN RAISE EXCEPTION 'Direction must be -1 or 1' USING ERRCODE = '22023'; END IF;

  PERFORM 1 FROM public.projects WHERE id = v_item.project_id FOR UPDATE;
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF v_item.sprint_id IS NOT NULL THEN RAISE EXCEPTION 'Only backlog items can be reordered' USING ERRCODE = '22023'; END IF;

  IF p_direction < 0 THEN
    SELECT * INTO v_other FROM public.work_items w
    WHERE w.project_id = v_item.project_id AND w.sprint_id IS NULL AND w.archived_at IS NULL
      AND (w.position, w.id) < (v_item.position, v_item.id)
    ORDER BY w.position DESC, w.id DESC LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO v_other FROM public.work_items w
    WHERE w.project_id = v_item.project_id AND w.sprint_id IS NULL AND w.archived_at IS NULL
      AND (w.position, w.id) > (v_item.position, v_item.id)
    ORDER BY w.position ASC, w.id ASC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_other.id IS NULL THEN RETURN to_jsonb(v_item); END IF;

  UPDATE public.work_items SET position = v_other.position, version = version + 1 WHERE id = v_item.id;
  UPDATE public.work_items SET position = v_item.position, version = version + 1 WHERE id = v_other.id;
  -- Equal positions would make the swap a no-op; separate them.
  IF v_item.position = v_other.position THEN
    UPDATE public.work_items SET position = position + p_direction WHERE id = v_item.id;
  END IF;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN jsonb_build_object('id', v_item.id);
END;
$$;

-- ITEM-03: tick or untick one checklist entry.
CREATE OR REPLACE FUNCTION public.rpc_toggle_checklist(p_item_id UUID, p_index INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF p_index < 0 OR p_index >= jsonb_array_length(v_item.checklist) THEN
    RAISE EXCEPTION 'Checklist entry not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.work_items SET
    checklist = jsonb_set(checklist, ARRAY[p_index::TEXT, 'done'],
                          to_jsonb(NOT COALESCE((checklist -> p_index ->> 'done')::BOOLEAN, false))),
    version = version + 1, updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- SPR-03 / SPR-05: allocate to a sprint or return to backlog; scope events for an active sprint.
CREATE OR REPLACE FUNCTION public.rpc_allocate_item(p_item_id UUID, p_sprint_id UUID DEFAULT NULL, p_reason TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_old public.sprints%ROWTYPE;
  v_new public.sprints%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(btrim(p_reason), ''), 'Changed during sprint planning');
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master']);

  PERFORM 1 FROM public.projects WHERE id = v_item.project_id FOR UPDATE;
  IF v_item.sprint_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.sprints WHERE id = v_item.sprint_id FOR UPDATE;
  END IF;
  IF p_sprint_id IS NOT NULL THEN
    SELECT * INTO v_new FROM public.sprints WHERE id = p_sprint_id FOR UPDATE;
    IF NOT FOUND OR v_new.project_id <> v_item.project_id THEN
      RAISE EXCEPTION 'Sprint not found in this project' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;

  IF v_item.sprint_id IS NOT DISTINCT FROM p_sprint_id THEN RETURN to_jsonb(v_item); END IF;
  IF v_item.status = 'Done' THEN RAISE EXCEPTION 'Done items cannot be re-allocated' USING ERRCODE = '22023'; END IF;
  IF v_old.status = 'COMPLETED' OR v_new.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Completed sprints cannot change' USING ERRCODE = '22023';
  END IF;
  IF v_new.status = 'ACTIVE' AND v_item.estimate IS NULL THEN
    RAISE EXCEPTION 'Estimate the item before adding it to the active sprint' USING ERRCODE = '22023';
  END IF;

  IF v_old.status = 'ACTIVE' THEN
    INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id)
    VALUES (v_old.id, v_item.id, 'REMOVED', v_reason, COALESCE(v_item.estimate, 0), auth.uid());
  END IF;
  IF v_new.status = 'ACTIVE' THEN
    INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id)
    VALUES (v_new.id, v_item.id, 'ADDED', v_reason, v_item.estimate, auth.uid());
  END IF;

  UPDATE public.work_items SET sprint_id = p_sprint_id, version = version + 1, updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Execute grants: signed-in users only; never anon.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rpc_create_project(TEXT, TEXT, TEXT, TEXT)',
    'public.rpc_create_sprint(UUID, TEXT, TEXT, DATE, DATE, INT, INT)',
    'public.rpc_update_sprint(UUID, JSONB, INT)',
    'public.rpc_start_sprint(UUID, INT)',
    'public.rpc_complete_sprint(UUID, UUID, INT)',
    'public.rpc_create_work_item(UUID, TEXT, TEXT, TEXT, INT)',
    'public.rpc_update_work_item(UUID, JSONB, INT)',
    'public.rpc_move_work_item(UUID, TEXT, INT, UUID)',
    'public.rpc_reorder_backlog(UUID, INT)',
    'public.rpc_toggle_checklist(UUID, INT)',
    'public.rpc_allocate_item(UUID, UUID, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.is_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member(UUID, UUID) TO authenticated;

-- Liveness probe for /api/health: proves the API can reach Postgres
-- without exposing any table to anonymous callers.
CREATE OR REPLACE FUNCTION public.health()
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.health() TO anon, authenticated;
