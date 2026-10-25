import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('project_members')
      .select('*, profile:profiles(username, display_name)')
      .eq('project_id', projectId)
      .is('removed_at', null);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const { userId, role } = req.body;
    
    const validRoles = ['Product Owner', 'Scrum Master', 'Developer', 'Viewer'];
    if (!validRoles.includes(role)) {
      return res.status(422).json({ error: 'Invalid role specified' });
    }

    const { data, error } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .is('removed_at', null)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body;

    // Soft-remove member to preserve actor attribution history
    const { data, error } = await supabase
      .from('project_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}