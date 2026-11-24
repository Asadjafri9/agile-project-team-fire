-- QA Tester role (Systems Architect request, 2026-11-24).
-- A distinct Scrum role with Developer-level working rights: read everything, create and
-- edit items (e.g. bugs), move cards, tick checklists, comment, attach files, record evidence.
-- No planning, prioritisation, team management, WIP configuration or archiving.
-- Implemented centrally: tf_require_role treats QA Tester as Developer for permission
-- checks, so every RPC that allows Developers allows QA Testers, and nothing else changes.

ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check CHECK (role IN ('Product Owner', 'Scrum Master', 'Developer', 'QA Tester', 'Viewer'));
ALTER TABLE public.project_invitations DROP CONSTRAINT IF EXISTS project_invitations_role_check;
ALTER TABLE public.project_invitations ADD CONSTRAINT project_invitations_role_check CHECK (role IN ('Product Owner', 'Scrum Master', 'Developer', 'QA Tester', 'Viewer'));
ALTER TABLE public.project_join_codes DROP CONSTRAINT IF EXISTS project_join_codes_role_check;
ALTER TABLE public.project_join_codes ADD CONSTRAINT project_join_codes_role_check CHECK (role IN ('Scrum Master', 'Developer', 'QA Tester', 'Viewer'));

CREATE OR REPLACE FUNCTION public.tf_valid_role(p_role TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('Product Owner', 'Scrum Master', 'Developer', 'QA Tester', 'Viewer') THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tf_valid_role(TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tf_require_role(p_project_id UUID, p_roles TEXT[] DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_check TEXT;
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
  -- Owner override: effective authority is Product Owner.
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.owner_id = v_uid) THEN
    v_role := 'Product Owner';
  END IF;
  -- QA Tester has Developer-level working rights wherever a Developer is allowed.
  v_check := CASE WHEN v_role = 'QA Tester' THEN 'Developer' ELSE v_role END;
  IF p_roles IS NOT NULL AND NOT (v_check = ANY (p_roles)) THEN
    RAISE EXCEPTION 'The % role cannot do this', v_role USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Project is archived and read-only' USING ERRCODE = '22023';
  END IF;
  RETURN v_role;
END;
$$;
REVOKE ALL ON FUNCTION public.tf_require_role(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_create_join_code(p_project_id UUID, p_role TEXT, p_days INT DEFAULT 7, p_max_uses INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.project_join_codes%ROWTYPE;
  v_code TEXT;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF p_role NOT IN ('Scrum Master', 'Developer', 'QA Tester', 'Viewer') THEN
    RAISE EXCEPTION 'Join codes can grant Scrum Master, Developer, QA Tester or Viewer' USING ERRCODE = '22023';
  END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'Join codes last 1 to 30 days' USING ERRCODE = '22023';
  END IF;
  IF p_max_uses IS NOT NULL AND p_max_uses NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Use limit must be between 1 and 500' USING ERRCODE = '22023';
  END IF;
  LOOP
    v_code := public.tf_new_join_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.project_join_codes WHERE code = v_code);
  END LOOP;
  INSERT INTO public.project_join_codes (project_id, code, role, created_by, expires_at, max_uses)
  VALUES (p_project_id, v_code, p_role, auth.uid(), clock_timestamp() + make_interval(days => p_days), p_max_uses)
  RETURNING * INTO v_row;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.rpc_create_join_code(UUID, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_join_code(UUID, TEXT, INT, INT) TO authenticated;
