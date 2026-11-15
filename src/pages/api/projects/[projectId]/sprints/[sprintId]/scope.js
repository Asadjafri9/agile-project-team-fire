import { createClient } from '../../../../../../lib/supabase/server';
import { httpError } from '../../../../../../lib/workspace/server';

// SPR-05: scope changes after start need a reason; the RPC writes the event.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { sprintId } = req.query;
  const { itemId, action, reason } = req.body ?? {};
  if (!['ADDED', 'REMOVED'].includes(action)) return res.status(400).json({ error: 'Action must be ADDED or REMOVED' });
  if (!reason) return res.status(400).json({ error: 'A reason is required for mid-sprint scope modifications' });

  const supabase = createClient(req, res);
  const { data, error } = await supabase.rpc('rpc_allocate_item', {
    p_item_id: itemId,
    p_sprint_id: action === 'ADDED' ? sprintId : null,
    p_reason: reason,
  });
  if (error) {
    const { status, body } = httpError(error);
    return res.status(status).json(body);
  }
  return res.status(200).json({ data });
}
