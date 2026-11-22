import { createClient } from '../../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('work_items')
      .select('*, assignee:profiles!assignee_id(display_name, username)')
      .eq('project_id', projectId)
      .is('archived_at', null)
      .order('position', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'POST') {
    const { title, type, priority, estimate = null } = req.body ?? {};

    // Validate story points per Fibonacci criteria (ITEM-04)
    const validEstimates = [null, 1, 2, 3, 5, 8, 13];
    if (!validEstimates.includes(estimate)) {
      return res.status(422).json({ error: 'Invalid story points estimate' });
    }

    const { data, error } = await supabase.rpc('rpc_create_work_item', {
      p_project_id: projectId,
      p_title: title,
      p_type: type,
      p_priority: priority,
      p_estimate: estimate,
    });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}