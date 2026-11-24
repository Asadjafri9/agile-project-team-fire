-- The project owner always keeps full authority over their project (requirements §3:
-- "Ownership is an additional property of one active project member").
-- Before this, an owner who changed their own Scrum role to Developer or Viewer lost
-- manager rights and could not change it back. Same signatures; only the owner case changes.

-- Central role check: the owner is authorized as Product Owner whatever their Scrum role.
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
  -- Owner override: effective authority is Product Owner.
  IF EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.owner_id = v_uid) THEN
    v_role := 'Product Owner';
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
REVOKE ALL ON FUNCTION public.tf_require_role(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

-- Manager-only reads (invitation list, join codes) include the owner.
CREATE OR REPLACE FUNCTION public.tf_is_manager(p_user UUID, p_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m
                 WHERE m.user_id = p_user AND m.project_id = p_project AND m.removed_at IS NULL
                   AND (m.role IN ('Product Owner', 'Scrum Master')
                        OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project AND p.owner_id = p_user)));
$$;
REVOKE ALL ON FUNCTION public.tf_is_manager(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tf_is_manager(UUID, UUID) TO authenticated;

-- Storage uploads: the owner may attach even if their Scrum role is Viewer.
CREATE OR REPLACE FUNCTION public.tf_can_attach(p_user UUID, p_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m JOIN public.projects p ON p.id = m.project_id
                 WHERE m.user_id = p_user AND m.project_id = p_project AND m.removed_at IS NULL
                   AND (m.role <> 'Viewer' OR p.owner_id = p_user) AND p.archived_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.tf_can_attach(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tf_can_attach(UUID, UUID) TO authenticated;
