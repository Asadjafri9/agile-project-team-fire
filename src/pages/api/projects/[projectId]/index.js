import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (error) return res.status(404).json({ error: 'Project not found' });
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const { archived } = req.body;
    
    // Archive project if owner
    if (archived === true) {
      const { data, error } = await supabase
        .from('projects')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', projectId)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ data });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}