-- Mention notifications remember the exact comment, so clicking one can open the work
-- item and scroll to the comment where the person was mentioned. Same RPC signatures.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES public.work_item_comments(id) ON DELETE SET NULL;

-- Backfill existing mention notifications with the newest matching comment by that author on that item.
UPDATE public.notifications n SET comment_id = (
  SELECT wc.id FROM public.work_item_comments wc
  WHERE wc.work_item_id = n.work_item_id AND n.user_id = ANY (wc.mentions) AND wc.created_at <= n.created_at + interval '5 seconds'
  ORDER BY wc.created_at DESC LIMIT 1)
WHERE n.kind = 'mention' AND n.comment_id IS NULL;

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

  INSERT INTO public.notifications (user_id, project_id, work_item_id, comment_id, kind, text)
  SELECT m, v_item.project_id, v_item.id, v_comment.id, 'mention',
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
  INSERT INTO public.notifications (user_id, project_id, work_item_id, comment_id, kind, text)
  SELECT m, v_comment.project_id, v_comment.work_item_id, v_comment.id, 'mention',
         public.tf_display_name(auth.uid()) || ' mentioned you on ' || v_key || ': ' || left(btrim(p_body), 120)
  FROM unnest(v_new) AS m WHERE NOT (m = ANY (v_comment.mentions));

  UPDATE public.work_item_comments SET body = btrim(p_body), mentions = v_new, edited_at = clock_timestamp()
  WHERE id = p_comment_id RETURNING * INTO v_comment;
  PERFORM public.tf_bump_revision(v_comment.project_id);
  RETURN to_jsonb(v_comment);
END;
$$;
