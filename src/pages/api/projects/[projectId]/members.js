import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  if (req.method !== 'GET') {
    // PROJ-03 member role changes and removal: not delivered in this release.
    return res.status(501).json({ error: 'Member management is not available in this release' });
  }
  const supabase = createClient(req, res);
  const { data, error } = await supabase
    .from('project_members')
    .select('*, profile:profiles(username, display_name)')
    .eq('project_id', projectId)
    .is('removed_at', null);
  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
}
