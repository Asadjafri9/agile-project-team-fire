-- Sprint date guards (GitHub issue #4; SPR-01, SPR-04).
-- Forward-only: replaces two RPC bodies with stricter validation, same signatures.

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
  -- Issue #4: an already-expired sprint cannot be started (dates are in the project's timezone).
  IF v_sprint.end_date < (clock_timestamp() AT TIME ZONE (SELECT p.timezone FROM public.projects p WHERE p.id = v_sprint.project_id))::DATE THEN
    RAISE EXCEPTION 'The planned end date (%) has already passed. Update the dates before starting.', v_sprint.end_date USING ERRCODE = '22023';
  END IF;
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

  -- Issue #4: dates are required; reject blanks with a clear message instead of a cast error.
  IF (p_patch ? 'start' AND COALESCE(btrim(p_patch ->> 'start'), '') = '')
     OR (p_patch ? 'end' AND COALESCE(btrim(p_patch ->> 'end'), '') = '') THEN
    RAISE EXCEPTION 'Start and end dates are required' USING ERRCODE = '22023';
  END IF;

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
