-- REL-02: private attachment bucket. Objects live at <project_id>/<item_id>/<uuid>-<name>.
-- No public bucket and no permanent public links: downloads use short-lived signed URLs
-- that Storage only issues to current project members (SELECT policy below).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('project-attachments', 'project-attachments', false, 10485760,
        ARRAY['application/pdf', 'image/png', 'image/jpeg', 'text/plain'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
                               allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.tf_try_uuid(p TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN p::UUID;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tf_try_uuid(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.tf_can_attach(p_user UUID, p_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members m JOIN public.projects p ON p.id = m.project_id
                 WHERE m.user_id = p_user AND m.project_id = p_project AND m.removed_at IS NULL
                   AND m.role <> 'Viewer' AND p.archived_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.tf_can_attach(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tf_can_attach(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Members read project attachments" ON storage.objects;
CREATE POLICY "Members read project attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-attachments'
         AND public.is_member(auth.uid(), public.tf_try_uuid((storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Contributors upload project attachments" ON storage.objects;
CREATE POLICY "Contributors upload project attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-attachments'
              AND public.tf_can_attach(auth.uid(), public.tf_try_uuid((storage.foldername(name))[1])));
