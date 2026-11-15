-- Shareable project join codes / links (extends PROJ-02).
-- Managers create a code with a role (never Product Owner), expiry and optional use limit;
-- any signed-in account can join with it. Failed guesses are throttled per account.

CREATE TABLE IF NOT EXISTS public.project_join_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  role VARCHAR(20) NOT NULL CHECK (role IN ('Scrum Master', 'Developer', 'Viewer')),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INT CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 500),
  uses INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.join_code_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_join_attempts_user ON public.join_code_attempts (user_id, created_at);

ALTER TABLE public.project_join_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_code_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Managers read join codes" ON public.project_join_codes;
CREATE POLICY "Managers read join codes" ON public.project_join_codes FOR SELECT TO authenticated
  USING (public.tf_is_manager(auth.uid(), project_id));
REVOKE ALL ON public.project_join_codes, public.join_code_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_join_codes FROM authenticated;
REVOKE ALL ON public.join_code_attempts FROM authenticated;
GRANT SELECT ON public.project_join_codes TO authenticated;

-- Unambiguous alphabet (no 0/O, 1/I/L): 30 symbols, 8 characters ≈ 6.5e11 codes.
CREATE OR REPLACE FUNCTION public.tf_new_join_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SET search_path = '' AS $$
DECLARE
  v_alpha CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ2345679';
  v_bytes BYTEA := extensions.gen_random_bytes(8);
  v_out TEXT := '';
BEGIN
  FOR i IN 0..7 LOOP
    v_out := v_out || substr(v_alpha, (get_byte(v_bytes, i) % 30) + 1, 1);
    IF i = 3 THEN v_out := v_out || '-'; END IF;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.tf_new_join_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_create_join_code(p_project_id UUID, p_role TEXT, p_days INT DEFAULT 7, p_max_uses INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.project_join_codes%ROWTYPE;
  v_code TEXT;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF p_role NOT IN ('Scrum Master', 'Developer', 'Viewer') THEN
    RAISE EXCEPTION 'Join codes can grant Scrum Master, Developer or Viewer' USING ERRCODE = '22023';
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

CREATE OR REPLACE FUNCTION public.rpc_revoke_join_code(p_code_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_row public.project_join_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.project_join_codes WHERE id = p_code_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Join code not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_row.project_id, ARRAY['Product Owner', 'Scrum Master']);
  UPDATE public.project_join_codes SET revoked_at = COALESCE(revoked_at, clock_timestamp()) WHERE id = p_code_id RETURNING * INTO v_row;
  PERFORM public.tf_bump_revision(v_row.project_id);
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_join_with_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clean TEXT := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_row public.project_join_codes%ROWTYPE;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Account disabled' USING ERRCODE = '28000';
  END IF;
  IF (SELECT count(*) FROM public.join_code_attempts
      WHERE user_id = v_uid AND created_at > clock_timestamp() - interval '15 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many invalid codes. Try again in 15 minutes.' USING ERRCODE = '22023';
  END IF;

  IF length(v_clean) = 8 THEN
    SELECT * INTO v_row FROM public.project_join_codes
    WHERE code = left(v_clean, 4) || '-' || right(v_clean, 4) FOR UPDATE;
  END IF;

  -- Existing members re-opening a link they already used just go to the project.
  IF v_row.id IS NOT NULL AND public.is_member(v_uid, v_row.project_id) THEN
    SELECT name INTO v_name FROM public.projects WHERE id = v_row.project_id;
    RETURN jsonb_build_object('project_id', v_row.project_id, 'project_name', v_name, 'already_member', true);
  END IF;

  IF v_row.id IS NULL OR v_row.revoked_at IS NOT NULL OR v_row.expires_at <= clock_timestamp()
     OR (v_row.max_uses IS NOT NULL AND v_row.uses >= v_row.max_uses)
     OR EXISTS (SELECT 1 FROM public.projects WHERE id = v_row.project_id AND archived_at IS NOT NULL) THEN
    -- Record the failed guess and RETURN (not raise) so the record is not rolled back.
    INSERT INTO public.join_code_attempts (user_id) VALUES (v_uid);
    -- One message for unknown, expired, revoked or used-up codes (no oracle).
    RETURN jsonb_build_object('invalid', true, 'message', 'That code is invalid or has expired. Ask for a new one.');
  END IF;

  SELECT name INTO v_name FROM public.projects WHERE id = v_row.project_id;

  INSERT INTO public.project_members (project_id, user_id, role)
  VALUES (v_row.project_id, v_uid, v_row.role)
  ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, removed_at = NULL, joined_at = clock_timestamp();
  UPDATE public.project_join_codes SET uses = uses + 1 WHERE id = v_row.id;
  PERFORM public.tf_bump_revision(v_row.project_id);
  RETURN jsonb_build_object('project_id', v_row.project_id, 'project_name', v_name, 'role', v_row.role, 'already_member', false);
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rpc_create_join_code(UUID, TEXT, INT, INT)',
    'public.rpc_revoke_join_code(UUID)',
    'public.rpc_join_with_code(TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;
