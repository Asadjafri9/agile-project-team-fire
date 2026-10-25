-- Missing SELECT policies: profiles and project_members had RLS enabled but no
-- policies, so any embedded read (e.g. projects.select('*, project_members!inner(*)'))
-- silently returned zero rows.

CREATE POLICY "Members read members" ON public.project_members
  FOR SELECT USING (public.is_member(auth.uid(), project_id));

CREATE POLICY "Members read profiles" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.user_id = profiles.id
        AND pm.removed_at IS NULL
        AND public.is_member(auth.uid(), pm.project_id)
    )
  );
