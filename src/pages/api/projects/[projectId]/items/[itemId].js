import { createClient } from '../../../../../lib/supabase/server';
import { actionToRpc, httpError } from '../../../../../lib/workspace/server';

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
    const { expectedVersion, estimate, ...rest } = req.body ?? {};
    const patch = { ...rest, ...(estimate !== undefined ? { points: estimate } : {}) };
    try {
      const { fn, args } = actionToRpc({ type: 'update-item', projectId, itemId, patch, expectedVersion });
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return res.status(200).json({ data });
    } catch (error) {
      const { status, body } = httpError(error);
      return res.status(status).json(body);
    }
  }

  if (req.method === 'DELETE') {
    // ITEM-01 archive: not delivered in this release.
    return res.status(501).json({ error: 'Archiving items is not available in this release' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
