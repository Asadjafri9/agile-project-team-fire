import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { projectId } = req.query;
  const supabase = createClient(req, res);

  const { data, error } = await supabase
    .from('project_revisions')
    .select('board_revision, updated_at')
    .eq('project_id', projectId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(400).json({ error: error.message });
  }

  // Set short cache-control for real-time responsiveness
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  return res.status(200).json({
    boardRevision: data ? data.board_revision : 1,
    updatedAt: data ? data.updated_at : new Date().toISOString(),
  });
}