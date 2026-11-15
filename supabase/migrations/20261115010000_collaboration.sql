-- Collaboration, membership management, archiving, attachments, evidence.
-- Forward-only and additive. Every write is a role-checked SECURITY DEFINER RPC.
-- Refs: PROJ-02, PROJ-03, PROJ-05, ITEM-01, ITEM-03, ITEM-07, ITEM-08, BOARD-05,
--       REL-02, COL-03, COL-04, COL-05, requirements.md §3

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS storage_budget_bytes BIGINT NOT NULL DEFAULT 104857600; -- 100 MB

CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('Product Owner', 'Scrum Master', 'Developer', 'Viewer')),
  invited_by UUID NOT NULL REFERENCES public.profiles(id),
  status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '7 days',
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_invite
  ON public.project_invitations (project_id, invitee_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS public.work_item_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  mentions UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_comments_item ON public.work_item_comments (work_item_id, created_at);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  work_item_id UUID REFERENCES public.work_items(id) ON DELETE CASCADE,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('mention', 'invitation')),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.work_item_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id),
  kind VARCHAR(24) NOT NULL,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON public.work_item_activity (project_id, created_at);

CREATE TABLE IF NOT EXISTS public.work_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_item_id UUID NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 200),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain')),
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  removed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.project_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  version TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'Other',
  evidence_date DATE NOT NULL DEFAULT current_date,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  removed_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- 2. RLS: members read their project's rows; nobody writes directly
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tf_is_manager(p_user UUID, p_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m
                 WHERE m.user_id = p_user AND m.project_id = p_project AND m.removed_at IS NULL
                   AND m.role IN ('Product Owner', 'Scrum Master'));
$$;
REVOKE ALL ON FUNCTION public.tf_is_manager(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tf_is_manager(UUID, UUID) TO authenticated;

ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_item_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and invitee read invitations" ON public.project_invitations FOR SELECT TO authenticated
  USING (invitee_id = auth.uid() OR public.tf_is_manager(auth.uid(), project_id));
CREATE POLICY "Members read comments" ON public.work_item_comments FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), project_id));
CREATE POLICY "Owner reads notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Members read activity" ON public.work_item_activity FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), project_id));
CREATE POLICY "Members read attachments" ON public.work_item_attachments FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), project_id));
CREATE POLICY "Members read evidence" ON public.project_evidence FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), project_id));

REVOKE ALL ON public.project_invitations, public.work_item_comments, public.notifications,
  public.work_item_activity, public.work_item_attachments, public.project_evidence FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.project_invitations, public.work_item_comments,
  public.notifications, public.work_item_activity, public.work_item_attachments, public.project_evidence
  FROM authenticated;
GRANT SELECT ON public.project_invitations, public.work_item_comments, public.notifications,
  public.work_item_activity, public.work_item_attachments, public.project_evidence TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tf_log(p_project UUID, p_item UUID, p_kind TEXT, p_detail TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.work_item_activity (project_id, work_item_id, actor_id, kind, detail)
  VALUES (p_project, p_item, auth.uid(), p_kind, p_detail);
$$;
REVOKE ALL ON FUNCTION public.tf_log(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tf_display_name(p_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT display_name FROM public.profiles WHERE id = p_user), 'Someone');
$$;
REVOKE ALL ON FUNCTION public.tf_display_name(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tf_require_owner(p_project UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tf_require_role(p_project, NULL);
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project AND p.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the project owner can do this' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tf_require_owner(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tf_valid_role(p_role TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('Product Owner', 'Scrum Master', 'Developer', 'Viewer') THEN
    RAISE EXCEPTION 'Unknown role' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.tf_valid_role(TEXT) FROM PUBLIC, anon, authenticated;

-- Removing a member clears their current assignments and records it (PROJ-03).
CREATE OR REPLACE FUNCTION public.tf_detach_member(p_project UUID, p_user UUID, p_why TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r RECORD;
BEGIN
  UPDATE public.project_members SET removed_at = clock_timestamp()
  WHERE project_id = p_project AND user_id = p_user AND removed_at IS NULL;
  FOR r IN SELECT id FROM public.work_items
           WHERE project_id = p_project AND assignee_id = p_user AND archived_at IS NULL ORDER BY id FOR UPDATE
  LOOP
    UPDATE public.work_items SET assignee_id = NULL, version = version + 1, updated_at = clock_timestamp() WHERE id = r.id;
    PERFORM public.tf_log(p_project, r.id, 'assignment', 'Unassigned ' || public.tf_display_name(p_user) || ' (' || p_why || ')');
  END LOOP;
  PERFORM public.tf_bump_revision(p_project);
END;
$$;
REVOKE ALL ON FUNCTION public.tf_detach_member(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Membership (PROJ-02, PROJ-03, PROJ-05)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_invite_member(p_project_id UUID, p_username TEXT, p_role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invitee public.profiles%ROWTYPE;
  v_inv public.project_invitations%ROWTYPE;
  v_project_name TEXT;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  PERFORM public.tf_valid_role(p_role);
  SELECT * INTO v_invitee FROM public.profiles WHERE username = lower(btrim(p_username));
  IF NOT FOUND OR v_invitee.disabled_at IS NOT NULL THEN
    RAISE EXCEPTION 'No active account with that username' USING ERRCODE = 'P0002';
  END IF;
  IF public.is_member(v_invitee.id, p_project_id) THEN
    RAISE EXCEPTION '% is already a member of this project', v_invitee.username USING ERRCODE = '22023';
  END IF;

  UPDATE public.project_invitations SET status = 'EXPIRED'
  WHERE project_id = p_project_id AND invitee_id = v_invitee.id AND status = 'PENDING' AND expires_at <= clock_timestamp();
  IF EXISTS (SELECT 1 FROM public.project_invitations
             WHERE project_id = p_project_id AND invitee_id = v_invitee.id AND status = 'PENDING') THEN
    RAISE EXCEPTION '% already has a pending invitation', v_invitee.username USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_invitations (project_id, invitee_id, role, invited_by)
  VALUES (p_project_id, v_invitee.id, p_role, auth.uid()) RETURNING * INTO v_inv;

  SELECT name INTO v_project_name FROM public.projects WHERE id = p_project_id;
  INSERT INTO public.notifications (user_id, project_id, kind, text)
  VALUES (v_invitee.id, NULL, 'invitation',
          public.tf_display_name(auth.uid()) || ' invited you to ' || v_project_name || ' as ' || p_role);

  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_inv);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_respond_invitation(p_invitation_id UUID, p_accept BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inv public.project_invitations%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND disabled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Account disabled' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO v_inv FROM public.project_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR v_inv.invitee_id <> v_uid THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;
  IF v_inv.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This invitation was already %', lower(v_inv.status) USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= clock_timestamp() THEN
    UPDATE public.project_invitations SET status = 'EXPIRED' WHERE id = v_inv.id;
    RAISE EXCEPTION 'This invitation has expired' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_inv.project_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Project is archived and read-only' USING ERRCODE = '22023';
  END IF;

  UPDATE public.project_invitations
  SET status = CASE WHEN p_accept THEN 'ACCEPTED' ELSE 'DECLINED' END, responded_at = clock_timestamp()
  WHERE id = v_inv.id RETURNING * INTO v_inv;

  IF p_accept THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (v_inv.project_id, v_uid, v_inv.role)
    ON CONFLICT (project_id, user_id) DO UPDATE
      SET role = EXCLUDED.role, removed_at = NULL, joined_at = clock_timestamp();
  END IF;
  UPDATE public.notifications SET read_at = clock_timestamp()
  WHERE user_id = v_uid AND kind = 'invitation' AND read_at IS NULL;

  PERFORM public.tf_bump_revision(v_inv.project_id);
  RETURN to_jsonb(v_inv);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_invitation(p_invitation_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_inv public.project_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.project_invitations WHERE id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_inv.project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF v_inv.status <> 'PENDING' THEN RAISE EXCEPTION 'Only pending invitations can be revoked' USING ERRCODE = '22023'; END IF;
  UPDATE public.project_invitations SET status = 'REVOKED', responded_at = clock_timestamp()
  WHERE id = v_inv.id RETURNING * INTO v_inv;
  PERFORM public.tf_bump_revision(v_inv.project_id);
  RETURN to_jsonb(v_inv);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_set_member_role(p_project_id UUID, p_user_id UUID, p_role TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner UUID;
  v_member public.project_members%ROWTYPE;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  PERFORM public.tf_valid_role(p_role);
  SELECT owner_id INTO v_owner FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF p_user_id = v_owner AND auth.uid() <> v_owner THEN
    RAISE EXCEPTION 'Only the owner can change the owner''s role' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_member FROM public.project_members
  WHERE project_id = p_project_id AND user_id = p_user_id AND removed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE public.project_members SET role = p_role WHERE id = v_member.id RETURNING * INTO v_member;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_member);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_remove_member(p_project_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND owner_id = p_user_id) THEN
    RAISE EXCEPTION 'The owner cannot be removed; transfer ownership first' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_member(p_user_id, p_project_id) THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_detach_member(p_project_id, p_user_id, 'removed from project');
  RETURN jsonb_build_object('removed', p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_leave_project(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.tf_require_role(p_project_id, NULL);
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'The owner must transfer ownership before leaving' USING ERRCODE = '22023';
  END IF;
  PERFORM public.tf_detach_member(p_project_id, auth.uid(), 'left project');
  RETURN jsonb_build_object('left', p_project_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_transfer_ownership(p_project_id UUID, p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  PERFORM public.tf_require_owner(p_project_id);
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR UPDATE;
  IF p_user_id = v_project.owner_id THEN RAISE EXCEPTION 'That member already owns the project' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_member(p_user_id, p_project_id) THEN
    RAISE EXCEPTION 'Ownership can only go to an active member' USING ERRCODE = '22023';
  END IF;
  UPDATE public.projects SET owner_id = p_user_id, version = version + 1 WHERE id = p_project_id RETURNING * INTO v_project;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_project);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_archive_project(p_project_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  PERFORM public.tf_require_owner(p_project_id);
  UPDATE public.projects SET archived_at = clock_timestamp(), version = version + 1
  WHERE id = p_project_id RETURNING * INTO v_project;
  UPDATE public.project_invitations SET status = 'REVOKED', responded_at = clock_timestamp()
  WHERE project_id = p_project_id AND status = 'PENDING';
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_project);
END;
$$;

-- BOARD-05: managers configure advisory WIP limits (99 = no limit).
CREATE OR REPLACE FUNCTION public.rpc_set_wip_limits(p_project_id UUID, p_limits JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_key TEXT;
  v_val JSONB;
  v_wip JSONB;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF jsonb_typeof(p_limits) <> 'object' THEN RAISE EXCEPTION 'Limits must be an object' USING ERRCODE = '22023'; END IF;
  SELECT wip_limits INTO v_wip FROM public.projects WHERE id = p_project_id FOR UPDATE;
  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_limits) LOOP
    IF v_key NOT IN ('To Do', 'In Progress', 'Code Review', 'Testing') THEN
      RAISE EXCEPTION 'WIP limits apply to To Do, In Progress, Code Review and Testing only' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(v_val) = 'null' THEN
      v_wip := jsonb_set(v_wip, ARRAY[v_key], '99'::jsonb);
    ELSIF jsonb_typeof(v_val) = 'number' AND (v_val #>> '{}')::NUMERIC = trunc((v_val #>> '{}')::NUMERIC)
          AND (v_val #>> '{}')::INT BETWEEN 1 AND 99 THEN
      v_wip := jsonb_set(v_wip, ARRAY[v_key], v_val);
    ELSE
      RAISE EXCEPTION 'A WIP limit must be a whole number from 1 to 99, or empty for no limit' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  UPDATE public.projects SET wip_limits = v_wip, version = version + 1 WHERE id = p_project_id;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN v_wip;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Work items: archive, checklist, priority rule
-- ---------------------------------------------------------------------------
-- ITEM-01 / ITEM-08 / SPR-05
CREATE OR REPLACE FUNCTION public.rpc_archive_work_item(p_item_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_sprint public.sprints%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master']);
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to archive an item' USING ERRCODE = '22023'; END IF;

  PERFORM 1 FROM public.projects WHERE id = v_item.project_id FOR UPDATE;
  IF v_item.sprint_id IS NOT NULL THEN
    SELECT * INTO v_sprint FROM public.sprints WHERE id = v_item.sprint_id FOR UPDATE;
  END IF;
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;

  IF v_sprint.status = 'ACTIVE' THEN
    IF v_item.status = 'Done' THEN
      RAISE EXCEPTION 'Done items cannot be archived while their sprint is active' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.sprint_scope_events (sprint_id, work_item_id, action, reason, estimate_at_event, actor_id)
    VALUES (v_sprint.id, v_item.id, 'REMOVED', 'Archived: ' || btrim(p_reason), COALESCE(v_item.estimate, 0), auth.uid());
  END IF;

  UPDATE public.work_items SET archived_at = clock_timestamp(), version = version + 1, updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;
  PERFORM public.tf_log(v_item.project_id, v_item.id, 'archived', 'Archived: ' || btrim(p_reason));
  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- ITEM-03: replace the checklist (add / edit / remove / reorder entries).
CREATE OR REPLACE FUNCTION public.rpc_set_checklist(p_item_id UUID, p_checklist JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_clean JSONB;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF jsonb_typeof(p_checklist) <> 'array' OR jsonb_array_length(p_checklist) > 50 THEN
    RAISE EXCEPTION 'A checklist is a list of at most 50 entries' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_checklist) e
             WHERE jsonb_typeof(e) <> 'object' OR COALESCE(btrim(e ->> 'text'), '') = '' OR length(e ->> 'text') > 200) THEN
    RAISE EXCEPTION 'Each checklist entry needs text (max 200 characters)' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('text', btrim(e ->> 'text'),
                                               'done', COALESCE((e ->> 'done')::BOOLEAN, false)) ORDER BY ord), '[]'::jsonb)
    INTO v_clean
  FROM jsonb_array_elements(p_checklist) WITH ORDINALITY AS t(e, ord);

  UPDATE public.work_items SET checklist = v_clean, version = version + 1, updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;
  PERFORM public.tf_log(v_item.project_id, v_item.id, 'checklist',
    'Checklist updated (' || (SELECT count(*) FROM jsonb_array_elements(v_clean) e WHERE (e ->> 'done')::BOOLEAN)
    || '/' || jsonb_array_length(v_clean) || ' done)');
  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- §3: only the Product Owner sets priority. Non-PO creations default to Medium.
CREATE OR REPLACE FUNCTION public.rpc_create_work_item(
  p_project_id UUID, p_title TEXT, p_type TEXT, p_priority TEXT, p_estimate INT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_role TEXT;
  v_project public.projects%ROWTYPE;
  v_n INT;
  v_pos INT;
  v_item public.work_items%ROWTYPE;
BEGIN
  v_role := public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
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
  VALUES (p_project_id, v_project.key || '-' || lpad(v_n::TEXT, 3, '0'), btrim(p_title), p_type,
          CASE WHEN v_role = 'Product Owner' THEN p_priority ELSE 'Medium' END, p_estimate, 'To Do', v_pos)
  RETURNING * INTO v_item;

  INSERT INTO public.work_item_status_history (project_id, work_item_id, old_status, new_status, actor_id, sprint_id, mutation_id)
  VALUES (p_project_id, v_item.id, NULL, 'To Do', auth.uid(), NULL, gen_random_uuid());
  PERFORM public.tf_log(p_project_id, v_item.id, 'created', 'Created ' || v_item.key);

  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- Field edits: priority is Product Owner only; estimate/assignment changes are logged (ITEM-07, COL-05).
CREATE OR REPLACE FUNCTION public.rpc_update_work_item(p_item_id UUID, p_patch JSONB, p_expected_version INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_before public.work_items%ROWTYPE;
  v_role TEXT;
  v_sprint_status TEXT;
  v_assignee UUID;
  v_estimate INT;
  v_labels TEXT[];
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  PERFORM public.tf_check_version(v_item.version, p_expected_version);
  v_before := v_item;

  SELECT s.status INTO v_sprint_status FROM public.sprints s WHERE s.id = v_item.sprint_id;

  IF p_patch ? 'priority' AND (p_patch ->> 'priority') IS DISTINCT FROM v_item.priority THEN
    IF v_role <> 'Product Owner' THEN
      RAISE EXCEPTION 'Only the Product Owner sets priority' USING ERRCODE = '42501';
    END IF;
    IF (p_patch ->> 'priority') NOT IN ('Low', 'Medium', 'High', 'Critical') THEN
      RAISE EXCEPTION 'Unknown priority' USING ERRCODE = '22023';
    END IF;
  END IF;
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
    IF v_assignee IS NOT NULL AND NOT public.is_member(v_assignee, v_item.project_id) THEN
      RAISE EXCEPTION 'Assignee must be a project member' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF p_patch ? 'labels' THEN
    IF jsonb_typeof(p_patch -> 'labels') <> 'array' OR jsonb_array_length(p_patch -> 'labels') > 10 THEN
      RAISE EXCEPTION 'Labels must be a list of at most 10' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT left(btrim(l), 40)) FILTER (WHERE btrim(l) <> ''), '{}')
      INTO v_labels FROM jsonb_array_elements_text(p_patch -> 'labels') AS l;
  END IF;

  UPDATE public.work_items SET
    title = CASE WHEN p_patch ? 'title' THEN left(btrim(p_patch ->> 'title'), 200) ELSE title END,
    description = CASE WHEN p_patch ? 'description' THEN jsonb_build_object('text', left(COALESCE(p_patch ->> 'description', ''), 20000)) ELSE description END,
    estimate = CASE WHEN p_patch ? 'points' THEN v_estimate ELSE estimate END,
    hours = CASE WHEN p_patch ? 'hours' THEN GREATEST(0, NULLIF(p_patch ->> 'hours', '')::INT) ELSE hours END,
    assignee_id = CASE WHEN p_patch ? 'assigneeId' THEN v_assignee ELSE assignee_id END,
    priority = CASE WHEN p_patch ? 'priority' THEN p_patch ->> 'priority' ELSE priority END,
    epic = CASE WHEN p_patch ? 'epic' THEN COALESCE(NULLIF(left(btrim(p_patch ->> 'epic'), 60), ''), 'Unassigned') ELSE epic END,
    labels = CASE WHEN p_patch ? 'labels' THEN v_labels ELSE labels END,
    version = version + 1,
    updated_at = clock_timestamp()
  WHERE id = p_item_id RETURNING * INTO v_item;

  IF v_item.estimate IS DISTINCT FROM v_before.estimate THEN
    PERFORM public.tf_log(v_item.project_id, v_item.id, 'estimate',
      'Estimate ' || COALESCE(v_before.estimate::TEXT, 'none') || ' → ' || COALESCE(v_item.estimate::TEXT, 'none') || ' pts');
  END IF;
  IF v_item.assignee_id IS DISTINCT FROM v_before.assignee_id THEN
    PERFORM public.tf_log(v_item.project_id, v_item.id, 'assignment',
      CASE WHEN v_item.assignee_id IS NULL THEN 'Unassigned' ELSE 'Assigned to ' || public.tf_display_name(v_item.assignee_id) END);
  END IF;
  IF v_item.priority IS DISTINCT FROM v_before.priority THEN
    PERFORM public.tf_log(v_item.project_id, v_item.id, 'priority', 'Priority ' || v_before.priority || ' → ' || v_item.priority);
  END IF;
  IF v_item.title IS DISTINCT FROM v_before.title OR v_item.description IS DISTINCT FROM v_before.description THEN
    PERFORM public.tf_log(v_item.project_id, v_item.id, 'edited', 'Edited details');
  END IF;

  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_item);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Comments, mentions, notifications (COL-03, COL-04)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_add_comment(p_item_id UUID, p_body TEXT, p_mentions UUID[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_comment public.work_item_comments%ROWTYPE;
  v_mentions UUID[];
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF COALESCE(btrim(p_body), '') = '' OR length(p_body) > 4000 THEN
    RAISE EXCEPTION 'A comment needs 1 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  -- Only current members can be mentioned; never yourself.
  SELECT COALESCE(array_agg(DISTINCT m), '{}') INTO v_mentions
  FROM unnest(COALESCE(p_mentions, '{}')) AS m
  WHERE m <> auth.uid() AND public.is_member(m, v_item.project_id);

  INSERT INTO public.work_item_comments (project_id, work_item_id, author_id, body, mentions)
  VALUES (v_item.project_id, v_item.id, auth.uid(), btrim(p_body), v_mentions) RETURNING * INTO v_comment;

  INSERT INTO public.notifications (user_id, project_id, work_item_id, kind, text)
  SELECT m, v_item.project_id, v_item.id, 'mention',
         public.tf_display_name(auth.uid()) || ' mentioned you on ' || v_item.key || ': ' || left(btrim(p_body), 120)
  FROM unnest(v_mentions) AS m;

  PERFORM public.tf_log(v_item.project_id, v_item.id, 'comment', 'Commented');
  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_comment);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_edit_comment(p_comment_id UUID, p_body TEXT, p_mentions UUID[] DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_comment public.work_item_comments%ROWTYPE;
  v_new UUID[];
  v_key TEXT;
BEGIN
  SELECT * INTO v_comment FROM public.work_item_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND OR v_comment.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_comment.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF v_comment.author_id <> auth.uid() THEN RAISE EXCEPTION 'You can only edit your own comments' USING ERRCODE = '42501'; END IF;
  IF COALESCE(btrim(p_body), '') = '' OR length(p_body) > 4000 THEN
    RAISE EXCEPTION 'A comment needs 1 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT m), '{}') INTO v_new
  FROM unnest(COALESCE(p_mentions, '{}')) AS m
  WHERE m <> auth.uid() AND public.is_member(m, v_comment.project_id);

  -- Notify only newly mentioned members.
  SELECT key INTO v_key FROM public.work_items WHERE id = v_comment.work_item_id;
  INSERT INTO public.notifications (user_id, project_id, work_item_id, kind, text)
  SELECT m, v_comment.project_id, v_comment.work_item_id, 'mention',
         public.tf_display_name(auth.uid()) || ' mentioned you on ' || v_key || ': ' || left(btrim(p_body), 120)
  FROM unnest(v_new) AS m WHERE NOT (m = ANY (v_comment.mentions));

  UPDATE public.work_item_comments SET body = btrim(p_body), mentions = v_new, edited_at = clock_timestamp()
  WHERE id = p_comment_id RETURNING * INTO v_comment;
  PERFORM public.tf_bump_revision(v_comment.project_id);
  RETURN to_jsonb(v_comment);
END;
$$;

-- Authors delete their own; managers moderate any, with an audit record.
CREATE OR REPLACE FUNCTION public.rpc_delete_comment(p_comment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_comment public.work_item_comments%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_comment FROM public.work_item_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND OR v_comment.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.tf_require_role(v_comment.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF v_comment.author_id <> auth.uid() AND v_role NOT IN ('Product Owner', 'Scrum Master') THEN
    RAISE EXCEPTION 'You can only delete your own comments' USING ERRCODE = '42501';
  END IF;
  UPDATE public.work_item_comments SET deleted_at = clock_timestamp(), deleted_by = auth.uid()
  WHERE id = p_comment_id RETURNING * INTO v_comment;
  PERFORM public.tf_log(v_comment.project_id, v_comment.work_item_id,
    CASE WHEN v_comment.author_id = auth.uid() THEN 'comment' ELSE 'moderation' END,
    CASE WHEN v_comment.author_id = auth.uid() THEN 'Deleted own comment'
         ELSE 'Removed a comment by ' || public.tf_display_name(v_comment.author_id) END);
  PERFORM public.tf_bump_revision(v_comment.project_id);
  RETURN jsonb_build_object('id', v_comment.id, 'deleted', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_mark_notifications_read(p_ids UUID[] DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE = '28000'; END IF;
  UPDATE public.notifications SET read_at = clock_timestamp()
  WHERE user_id = auth.uid() AND read_at IS NULL AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Pending invitations for the signed-in user, with names they cannot otherwise read.
CREATE OR REPLACE FUNCTION public.rpc_my_invitations()
RETURNS TABLE (id UUID, project_id UUID, project_name TEXT, role TEXT, invited_by_name TEXT, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT i.id, i.project_id, p.name, i.role, public.tf_display_name(i.invited_by), i.expires_at, i.created_at
  FROM public.project_invitations i JOIN public.projects p ON p.id = i.project_id
  WHERE i.invitee_id = auth.uid() AND i.status = 'PENDING' AND i.expires_at > clock_timestamp()
    AND p.archived_at IS NULL
  ORDER BY i.created_at DESC;
$$;

-- ---------------------------------------------------------------------------
-- 7. Attachments (REL-02) and evidence
-- ---------------------------------------------------------------------------
-- Called by the signing route before it issues an upload URL.
CREATE OR REPLACE FUNCTION public.rpc_authorize_upload(p_item_id UUID, p_name TEXT, p_size BIGINT, p_mime TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_used BIGINT;
  v_budget BIGINT;
  v_safe TEXT;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF p_mime NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain') THEN
    RAISE EXCEPTION 'Only PDF, PNG, JPEG and plain-text files can be attached' USING ERRCODE = '22023';
  END IF;
  IF p_size IS NULL OR p_size <= 0 OR p_size > 10485760 THEN
    RAISE EXCEPTION 'Files must be 10 MB or smaller' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(sum(size_bytes), 0) INTO v_used FROM public.work_item_attachments
  WHERE project_id = v_item.project_id AND removed_at IS NULL;
  SELECT storage_budget_bytes INTO v_budget FROM public.projects WHERE id = v_item.project_id;
  IF v_used + p_size > v_budget THEN
    RAISE EXCEPTION 'This project has used its file storage budget' USING ERRCODE = '22023';
  END IF;
  v_safe := left(regexp_replace(COALESCE(p_name, 'file'), '[^A-Za-z0-9._-]+', '_', 'g'), 100);
  RETURN v_item.project_id || '/' || v_item.id || '/' || gen_random_uuid() || '-' || v_safe;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_add_attachment(p_item_id UUID, p_path TEXT, p_name TEXT, p_size BIGINT, p_mime TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.work_items%ROWTYPE;
  v_att public.work_item_attachments%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.work_items WHERE id = p_item_id;
  IF NOT FOUND OR v_item.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.tf_require_role(v_item.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF p_path IS NULL OR p_path NOT LIKE (v_item.project_id || '/' || v_item.id || '/%') OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION 'Attachment path does not belong to this item' USING ERRCODE = '42501';
  END IF;
  -- The object must really exist in the private bucket (uploaded via the signed URL).
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-attachments' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Upload not found; please try again' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.work_item_attachments (project_id, work_item_id, storage_path, file_name, size_bytes, mime_type, uploaded_by)
  VALUES (v_item.project_id, v_item.id, p_path, left(btrim(p_name), 200), p_size, p_mime, auth.uid())
  RETURNING * INTO v_att;
  PERFORM public.tf_log(v_item.project_id, v_item.id, 'attachment', 'Attached ' || v_att.file_name);
  PERFORM public.tf_bump_revision(v_item.project_id);
  RETURN to_jsonb(v_att);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_remove_attachment(p_attachment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_att public.work_item_attachments%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_att FROM public.work_item_attachments WHERE id = p_attachment_id FOR UPDATE;
  IF NOT FOUND OR v_att.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Attachment not found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.tf_require_role(v_att.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF v_att.uploaded_by <> auth.uid() AND v_role NOT IN ('Product Owner', 'Scrum Master') THEN
    RAISE EXCEPTION 'Only the uploader or a manager can remove this file' USING ERRCODE = '42501';
  END IF;
  UPDATE public.work_item_attachments SET removed_at = clock_timestamp() WHERE id = p_attachment_id RETURNING * INTO v_att;
  PERFORM public.tf_log(v_att.project_id, v_att.work_item_id, 'attachment', 'Removed ' || v_att.file_name);
  PERFORM public.tf_bump_revision(v_att.project_id);
  RETURN to_jsonb(v_att);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_add_evidence(
  p_project_id UUID, p_title TEXT, p_version TEXT, p_kind TEXT, p_date DATE, p_note TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ev public.project_evidence%ROWTYPE;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF COALESCE(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Evidence needs a title' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.project_evidence (project_id, title, version, kind, evidence_date, note, created_by)
  VALUES (p_project_id, left(btrim(p_title), 200), left(COALESCE(p_version, ''), 40), left(COALESCE(NULLIF(p_kind, ''), 'Other'), 40),
          COALESCE(p_date, current_date), left(COALESCE(p_note, ''), 1000), auth.uid())
  RETURNING * INTO v_ev;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_ev);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_remove_evidence(p_evidence_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ev public.project_evidence%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_ev FROM public.project_evidence WHERE id = p_evidence_id FOR UPDATE;
  IF NOT FOUND OR v_ev.removed_at IS NOT NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE = 'P0002'; END IF;
  v_role := public.tf_require_role(v_ev.project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF v_ev.created_by <> auth.uid() AND v_role NOT IN ('Product Owner', 'Scrum Master') THEN
    RAISE EXCEPTION 'Only the author or a manager can remove evidence' USING ERRCODE = '42501';
  END IF;
  UPDATE public.project_evidence SET removed_at = clock_timestamp() WHERE id = p_evidence_id RETURNING * INTO v_ev;
  PERFORM public.tf_bump_revision(v_ev.project_id);
  RETURN jsonb_build_object('id', v_ev.id, 'removed', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.rpc_invite_member(UUID, TEXT, TEXT)',
    'public.rpc_respond_invitation(UUID, BOOLEAN)',
    'public.rpc_revoke_invitation(UUID)',
    'public.rpc_set_member_role(UUID, UUID, TEXT)',
    'public.rpc_remove_member(UUID, UUID)',
    'public.rpc_leave_project(UUID)',
    'public.rpc_transfer_ownership(UUID, UUID)',
    'public.rpc_archive_project(UUID)',
    'public.rpc_set_wip_limits(UUID, JSONB)',
    'public.rpc_archive_work_item(UUID, TEXT)',
    'public.rpc_set_checklist(UUID, JSONB)',
    'public.rpc_create_work_item(UUID, TEXT, TEXT, TEXT, INT)',
    'public.rpc_update_work_item(UUID, JSONB, INT)',
    'public.rpc_add_comment(UUID, TEXT, UUID[])',
    'public.rpc_edit_comment(UUID, TEXT, UUID[])',
    'public.rpc_delete_comment(UUID)',
    'public.rpc_mark_notifications_read(UUID[])',
    'public.rpc_my_invitations()',
    'public.rpc_authorize_upload(UUID, TEXT, BIGINT, TEXT)',
    'public.rpc_add_attachment(UUID, TEXT, TEXT, BIGINT, TEXT)',
    'public.rpc_remove_attachment(UUID)',
    'public.rpc_add_evidence(UUID, TEXT, TEXT, TEXT, DATE, TEXT)',
    'public.rpc_remove_evidence(UUID)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$$;
