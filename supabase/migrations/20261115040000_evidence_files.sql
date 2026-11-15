-- Delivery evidence can carry a document (reuses the private attachment bucket).
-- Objects live at <project_id>/evidence/<uuid>-<name>, so the existing storage
-- policies (members read; non-Viewer members of a live project upload) apply.

ALTER TABLE public.project_evidence
  ADD COLUMN IF NOT EXISTS storage_path TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT CHECK (size_bytes IS NULL OR (size_bytes > 0 AND size_bytes <= 10485760)),
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Evidence documents may be office files and data exports as well.
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'application/pdf', 'image/png', 'image/jpeg', 'text/plain',
  'text/markdown', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
] WHERE id = 'project-attachments';

CREATE OR REPLACE FUNCTION public.tf_evidence_mime_ok(p_mime TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_mime IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/markdown', 'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation');
$$;

CREATE OR REPLACE FUNCTION public.rpc_authorize_evidence_upload(p_project_id UUID, p_name TEXT, p_size BIGINT, p_mime TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_used BIGINT;
  v_budget BIGINT;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF NOT public.tf_evidence_mime_ok(p_mime) THEN
    RAISE EXCEPTION 'Evidence files can be PDF, Word, Excel, PowerPoint, PNG, JPEG, CSV, Markdown or text' USING ERRCODE = '22023';
  END IF;
  IF p_size IS NULL OR p_size <= 0 OR p_size > 10485760 THEN
    RAISE EXCEPTION 'Files must be 10 MB or smaller' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE((SELECT sum(size_bytes) FROM public.work_item_attachments WHERE project_id = p_project_id AND removed_at IS NULL), 0)
       + COALESCE((SELECT sum(size_bytes) FROM public.project_evidence WHERE project_id = p_project_id AND removed_at IS NULL), 0)
    INTO v_used;
  SELECT storage_budget_bytes INTO v_budget FROM public.projects WHERE id = p_project_id;
  IF v_used + p_size > v_budget THEN
    RAISE EXCEPTION 'This project has used its file storage budget' USING ERRCODE = '22023';
  END IF;
  RETURN p_project_id || '/evidence/' || gen_random_uuid() || '-'
         || left(regexp_replace(COALESCE(p_name, 'file'), '[^A-Za-z0-9._-]+', '_', 'g'), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_add_evidence_file(
  p_project_id UUID, p_title TEXT, p_version TEXT, p_kind TEXT, p_date DATE, p_note TEXT,
  p_path TEXT, p_name TEXT, p_size BIGINT, p_mime TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ev public.project_evidence%ROWTYPE;
BEGIN
  PERFORM public.tf_require_role(p_project_id, ARRAY['Product Owner', 'Scrum Master', 'Developer']);
  IF COALESCE(btrim(p_title), '') = '' THEN RAISE EXCEPTION 'Evidence needs a title' USING ERRCODE = '22023'; END IF;
  IF p_path IS NULL OR p_path NOT LIKE (p_project_id || '/evidence/%') OR p_path LIKE '%..%' THEN
    RAISE EXCEPTION 'File path does not belong to this project' USING ERRCODE = '42501';
  END IF;
  IF NOT public.tf_evidence_mime_ok(p_mime) OR p_size IS NULL OR p_size <= 0 OR p_size > 10485760 THEN
    RAISE EXCEPTION 'Unsupported evidence file' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'project-attachments' AND o.name = p_path) THEN
    RAISE EXCEPTION 'Upload not found; please try again' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.project_evidence (project_id, title, version, kind, evidence_date, note, created_by,
                                       storage_path, file_name, size_bytes, mime_type)
  VALUES (p_project_id, left(btrim(p_title), 200), left(COALESCE(p_version, ''), 40), left(COALESCE(NULLIF(p_kind, ''), 'Other'), 40),
          COALESCE(p_date, current_date), left(COALESCE(p_note, ''), 1000), auth.uid(),
          p_path, left(btrim(COALESCE(p_name, 'file')), 200), p_size, p_mime)
  RETURNING * INTO v_ev;
  PERFORM public.tf_bump_revision(p_project_id);
  RETURN to_jsonb(v_ev);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_authorize_evidence_upload(UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_evidence_upload(UUID, TEXT, BIGINT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.rpc_add_evidence_file(UUID, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_evidence_file(UUID, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
