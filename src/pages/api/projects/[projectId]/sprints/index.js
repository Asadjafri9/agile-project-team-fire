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

    const { data, error } = await supabase
      .from('sprints')
      .insert({
        project_id: projectId,
        name,
        goal,
        start_date: startDate,
        end_date: endDate,
        capacity_points: capacityPoints || 0,
        status: 'PLANNED',
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(201).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}