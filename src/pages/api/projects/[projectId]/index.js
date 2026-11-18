import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  if (req.method !== 'GET') {
    // PROJ-05 archiving: not delivered in this release.
    return res.status(501).json({ error: 'Project archiving is not available in this release' });
  }
  const supabase = createClient(req, res);
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
  if (error) return res.status(404).json({ error: 'Project not found' });
  return res.status(200).json({ data });
}
