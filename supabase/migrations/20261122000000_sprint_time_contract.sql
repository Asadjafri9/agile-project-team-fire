-- Bolt 002 / FR-3: recorded actual start and immutable sprint timezone.
-- Additive migration. Existing started_at values are never inferred or rewritten.
ALTER TABLE public.sprints ADD COLUMN timezone_snapshot TEXT;

-- Legacy limitation: the original timezone was not recorded. Freeze the current
-- project timezone for already-started/completed rows rather than invent history.
UPDATE public.sprints s SET timezone_snapshot = p.timezone
FROM public.projects p
WHERE s.project_id = p.id AND (s.status <> 'PLANNED' OR s.started_at IS NOT NULL);

COMMENT ON COLUMN public.sprints.timezone_snapshot IS
  'Project timezone captured at start; pre-migration started/completed rows use the project timezone at migration time. Planned rows remain null.';

-- A trigger prevents privileged future code from accidentally rewriting history.
-- Writes still go through the existing identity-checked RPC boundary.
CREATE FUNCTION public.tf_preserve_sprint_timezone()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.timezone_snapshot IS NOT NULL
     AND NEW.timezone_snapshot IS DISTINCT FROM OLD.timezone_snapshot THEN
    RAISE EXCEPTION 'Sprint timezone is frozen' USING ERRCODE = '22023';
  END IF;
  IF NEW.timezone_snapshot IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone_snapshot
  ) THEN
    RAISE EXCEPTION 'Invalid sprint timezone' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tf_preserve_sprint_timezone() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER preserve_sprint_timezone BEFORE INSERT OR UPDATE ON public.sprints
FOR EACH ROW EXECUTE FUNCTION public.tf_preserve_sprint_timezone();

CREATE OR REPLACE FUNCTION public.rpc_start_sprint(p_sprint_id UUID, p_expected_version INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_sprint public.sprints%ROWTYPE;
  v_uid UUID := auth.uid();
  v_unestimated INT;
  v_timezone TEXT;
  v_started_at TIMESTAMPTZ;
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
  SELECT timezone INTO v_timezone FROM public.projects WHERE id = v_sprint.project_id;
  v_started_at := clock_timestamp();
  -- The planned end is an exclusive local-date boundary (Bolt 002).
  IF v_sprint.end_date <= (v_started_at AT TIME ZONE v_timezone)::DATE THEN
    RAISE EXCEPTION 'The planned end date (%) has been reached or passed. Update the dates before starting.', v_sprint.end_date USING ERRCODE = '22023';
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

  UPDATE public.sprints SET status = 'ACTIVE', started_at = v_started_at, timezone_snapshot = v_timezone, version = version + 1
  WHERE id = p_sprint_id RETURNING * INTO v_sprint;

  PERFORM public.tf_bump_revision(v_sprint.project_id);
  RETURN to_jsonb(v_sprint);
END;
$$;
