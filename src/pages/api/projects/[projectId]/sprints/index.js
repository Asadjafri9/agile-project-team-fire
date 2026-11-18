import { createClient } from '../../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId } = req.query;
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('sprints')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'POST') {
    const { name, goal, startDate, endDate, capacityPoints } = req.body;

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(422).json({ error: 'End date must follow start date' });
    }

    const { data, error } = await supabase.rpc('rpc_create_sprint', {
      p_project_id: projectId,
      p_name: name,
      p_goal: goal ?? '',
      p_start: startDate,
      p_end: endDate,
      p_point_capacity: capacityPoints ?? 0,
      p_hour_capacity: 0,
    });

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}