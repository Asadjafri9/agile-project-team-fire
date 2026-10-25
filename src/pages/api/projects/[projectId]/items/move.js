import { createClient } from '../../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { itemId, newStatus, newPosition, expectedVersion, mutationId } = req.body;
  const supabase = createClient(req, res);

  const { data, error } = await supabase.rpc('rpc_move_work_item', {
    p_item_id: itemId,
    p_new_status: newStatus,
    p_new_position: parseInt(newPosition, 10),
    p_expected_version: parseInt(expectedVersion, 10),
    p_mutation_id: mutationId,
  });

  if (error) {
    if (error.code === '40001') return res.status(409).json({ error: 'Version conflict. Refresh data.' });
    if (error.code === '42501') return res.status(403).json({ error: 'Unauthorized write' });
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ data });
}