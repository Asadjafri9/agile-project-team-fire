import { createClient } from '../../../../../lib/supabase/server';

export default async function handler(req, res) {
  const { projectId, itemId } = req.query;
  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('work_items')
      .select('*, assignee:profiles!assignee_id(display_name, username)')
      .eq('id', itemId)
      .eq('project_id', projectId)
      .single();

    if (error) return res.status(404).json({ error: 'Item not found' });
    return res.status(200).json({ data });
  }

  if (req.method === 'PATCH') {
    const { title, description, priority, estimate, expectedVersion } = req.body;

    const { data: currentItem, error: fetchError } = await supabase
      .from('work_items')
      .select('version, sprint_id')
      .eq('id', itemId)
      .single();

    if (fetchError) return res.status(404).json({ error: 'Item not found' });
    if (currentItem.version !== expectedVersion) {
      return res.status(409).json({ error: 'Conflict: Item was modified by another user' });
    }

    // Check estimate lock if item is currently in an active sprint
    if (estimate !== undefined) {
      if (currentItem.sprint_id) {
        const { data: sprint } = await supabase
          .from('sprints')
          .select('status')
          .eq('id', currentItem.sprint_id)
          .single();

        if (sprint?.status === 'ACTIVE') {
          return res.status(422).json({ error: 'Estimates are locked while item belongs to an active sprint' });
        }
      }
    }

    const { data, error } = await supabase
      .from('work_items')
      .update({
        ...(title && { title }),
        ...(description && { description }),
        ...(priority && { priority }),
        ...(estimate !== undefined && { estimate }),
        version: currentItem.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  if (req.method === 'DELETE') {
    // Soft archive
    const { data, error } = await supabase
      .from('work_items')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}